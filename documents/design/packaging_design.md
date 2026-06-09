# 应用打包与交付 — 软件设计文档

> 本文档承接《应用打包与交付 — 需求规格说明书》，对 RobotOps Studio 的前端静态构建、后端资源内嵌、外置配置加载、pkg 单文件二进制打包、压缩与验收流程进行技术设计细化。

---

## 1. 概述

RobotOps Studio 的交付形态设计为「单进程本地 Web 应用」。前端通过 Vite 构建为纯静态资源；后端基于 Node.js + Hono 提供业务 API，同时从二进制内嵌资源中托管前端页面。最终通过 `pkg` 将 Node.js 运行时、后端代码、前端静态资源与必要运行资产打包为各平台独立单文件二进制程序。

运行时用户只需要启动对应平台的可执行文件，然后使用本地浏览器访问：

```text
http://127.0.0.1:<port>
```

程序不包含 Electron 或任何桌面壳，不依赖目标机器安装 Node.js、npm、Nginx 或前端静态目录。

---

## 2. 设计约束

- 后端继续使用 TypeScript + ES6 module 语法，运行框架为 Hono + `@hono/node-server`。
- 前端继续使用 React + Vite，生产构建产物必须为纯静态 `dist`。
- 打包工具采用 `pkg`，作为项目本地开发依赖调用，不要求全局安装。
- 目标产物为各平台单文件二进制程序，前端 `dist` 不作为运行必需目录分发。
- 外置配置仅支持与可执行文件同目录的 `config.json`，不支持 YAML。
- 默认固定端口策略；端口被占用时启动失败，不自动递增。
- 所有后端运行日志必须通过 Pino 记录，不使用 `console.log`、`console.error`、`console.warn`。
- 构建脚本不得依赖系统级包安装，不使用 `apt install`、`npm install -g` 等方式。
- 设计需兼容 Windows / macOS Intel / macOS arm64 / Linux amd64 / Linux arm64。

---

## 3. 总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│                      Build Workspace                         │
│                                                              │
│  src/frontend                   src/backend                  │
│   ├── Vite build ───────┐        ├── TypeScript build        │
│   └── dist/             │        └── dist/                   │
│                         │              │                     │
│                         ▼              ▼                     │
│                 frontend asset manifest + embedded assets    │
│                                  │                           │
│                                  ▼                           │
│                         pkg packaging pipeline               │
│                                  │                           │
│                                  ▼                           │
│                         release/<platform>/                  │
└──────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│                    Target User Machine                       │
│                                                              │
│  robotops-studio(.exe)                                       │
│   ├── embedded Node.js runtime                               │
│   ├── backend Hono API routes             /api/**            │
│   ├── embedded frontend static assets      /assets/**        │
│   ├── SPA fallback                         /*               │
│   └── config loader                        ./config.json     │
│                                                              │
│  Browser ───────────────► http://127.0.0.1:<port>            │
└──────────────────────────────────────────────────────────────┘
```

运行时只有一个后端进程。该进程完成以下职责：

1. 加载外置 `config.json` 并合并默认配置。
2. 初始化日志、对象存储、业务服务、任务流引擎、SSE 等后端能力。
3. 注册 `/api/**` 业务接口。
4. 注册内嵌前端静态资源服务。
5. 注册 SPA 兜底路由。
6. 使用固定端口启动 HTTP 服务。

---

## 4. 目录与模块设计

### 4.1 建议目录结构

```text
src/
├── package.json                     # 新增：产品级构建编排入口
├── scripts/                         # 新增：跨前后端构建与发布脚本
│   ├── prepare-frontend-assets.ts
│   ├── compress-binaries.ts
│   └── verify-release.ts
├── frontend/
│   ├── package.json
│   └── dist/                        # Vite 生产构建输出
└── backend/
    ├── package.json
    ├── tsconfig.json
    ├── pkg.config.json              # 新增：pkg 配置
    ├── config.example.json          # 新增：外置配置示例
    ├── dist-static/                 # 新增：由前端 dist 准备而来，进入 pkg assets
    └── src/
        ├── index.ts
        ├── runtime/
        │   └── appConfig.ts         # 新增：配置加载、路径解析与命令行覆盖
        ├── static/
        │   ├── staticAssetService.ts
        │   └── staticRoutes.ts
        └── ... existing routes/services
```

说明：

- `index.ts` 保持为二进制入口，负责调用启动流程。
- `app.ts` 将 Hono app 创建与路由注册从入口中拆出，便于测试和打包后启动校验。
- `runtime/` 封装配置、路径和启动参数处理，避免入口文件持续膨胀。
- `static/` 封装前端静态资源内嵌与服务逻辑，避免与业务 API 耦合。
- `scripts/` 使用 TypeScript 编写，执行时通过本地 `tsx` 或编译后 Node 调用。

### 4.2 前端目录调整

前端维持现有目录结构：

```text
src/frontend/
├── package.json
├── vite.config.ts
└── src/
```

生产构建输出固定为：

```text
src/frontend/dist/
```

Vite 生产环境需要保证：

- `base` 使用相对或根路径策略，推荐 `base: "/"`。
- API 请求使用 `/api/**` 同源路径。
- 不依赖 Vite dev server proxy。

---

## 5. 构建流程设计

### 5.1 全平台打包命令

统一打包命令由 `src/package.json` 提供。`src/package.json` 是产品级构建编排入口，负责协调 `frontend` 与 `backend` 两个 workspace 完成构建、资源整合、pkg 打包、压缩与 release 校验。

从仓库根目录执行：

```bash
npm --prefix src run package:all
```

或在 `src/` 目录下执行：

```bash
npm run package:all
```

`src/package.json` 脚本草案：

```json
{
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "build:frontend": "npm --workspace frontend run build",
    "prepare:assets": "tsx scripts/prepare-frontend-assets.ts",
    "build:backend": "npm --workspace backend run build",
    "package:pkg": "npm --workspace backend run package:pkg",
    "compress": "tsx scripts/compress-binaries.ts",
    "verify": "tsx scripts/verify-release.ts",
    "package:all": "npm run build:frontend && npm run prepare:assets && npm run build:backend && npm run package:pkg && npm run compress && npm run verify"
  }
}
```

`package:all` 应串行执行完整构建流水线，任一步失败立即退出非零状态。

### 5.2 构建流水线

```text
src/package.json package:all
  │
  ├─ 1. npm --workspace frontend run build
  │     └─ 输出 src/frontend/dist
  │
  ├─ 2. tsx scripts/prepare-frontend-assets.ts
  │     ├─ 扫描 src/frontend/dist
  │     ├─ 生成 asset-manifest.json
  │     └─ 复制内嵌资产到 src/backend/dist-static
  │
  ├─ 3. npm --workspace backend run build
  │     └─ 输出 src/backend/dist
  │
  ├─ 4. npm --workspace backend run package:pkg
  │     └─ pkg --config pkg.config.json --targets ...
  │
  ├─ 5. tsx scripts/compress-binaries.ts
  │     └─ 按配置压缩 release/_raw 中的各平台二进制
  │
  └─ 6. tsx scripts/verify-release.ts
        ├─ release/windows-amd64/robotops-studio.exe
        ├─ release/macos-amd64/robotops-studio
        ├─ release/macos-arm64/robotops-studio
        ├─ release/linux-amd64/robotops-studio
        └─ release/linux-arm64/robotops-studio
        ├─ 校验产物存在
        ├─ 校验可执行位
        └─ 当前宿主平台执行基础启动或 health check
```

### 5.3 pkg 目标配置

当前实现固定使用 `pkg@5.8.1` 与 Node 18 目标，避免 Node 20/22 目标在部分环境下触发 base binary 源码构建。

```text
node18-win-x64
node18-macos-x64
node18-macos-arm64
node18-linux-x64
node18-linux-arm64
```

若后续升级 `pkg` 或切换到 `@yao-pkg/pkg`，必须先验证对应目标平台 base binary 可稳定下载或缓存，避免构建机长时间源码编译 Node.js。

### 5.4 pkg 配置草案

```json
{
  "scripts": [
    "dist/**/*.js"
  ],
  "assets": [
    "dist-static/**/*",
    "package.json"
  ],
  "targets": [
    "node18-win-x64",
    "node18-macos-x64",
    "node18-macos-arm64",
    "node18-linux-x64",
    "node18-linux-arm64"
  ],
  "outputPath": "../../release/_raw"
}
```

说明：

- `dist/**/*.js` 为后端 TypeScript 编译后的 JavaScript。
- `dist-static/**/*` 为从前端 `dist` 复制来的静态资源目录，作为 pkg asset 进入二进制快照文件系统。
- 入口文件由打包命令显式指定，例如 `pkg dist/index.js --config pkg.config.json`。
- 若使用生成的 `embeddedAssets.ts` 将资源转成 TypeScript 常量，则 `assets` 可减少，仅保留必要运行资产。

---

## 6. 前端静态资源内嵌设计

### 6.1 内嵌方案选择

推荐采用「pkg asset 快照文件系统 + 启动时只读访问」方案。

该方案将前端 `dist` 复制到后端构建上下文中的 `dist-static/`，并通过 `pkg.config.json.assets` 打包进二进制。运行时从 pkg 快照文件系统读取资源，不需要目标机器存在外部 `dist` 目录。

优点：

- 不需要把每个静态文件转换为 TypeScript 字符串，避免增大编译内存和源码体积。
- 保留文件路径结构，适配 Vite hash 资源名。
- 与 `pkg` assets 机制匹配，易于排查缺失文件。

备选方案为「生成 `embeddedAssets.ts` 常量映射」。仅当 pkg asset 读取在目标平台出现不可接受的问题时启用。

### 6.2 静态资源准备脚本

`prepare-frontend-assets.ts` 负责将前端产物准备为 pkg 可内嵌资产：

```text
输入：src/frontend/dist/
输出：src/backend/dist-static/
```

处理步骤：

1. 清空旧的 `src/backend/dist-static/`。
2. 递归复制 `src/frontend/dist/` 所有文件。
3. 生成 `src/backend/dist-static/asset-manifest.json`。
4. 校验 `index.html` 存在。
5. 校验所有文件路径使用 POSIX 风格相对路径。

`asset-manifest.json` 示例：

```json
{
  "generatedAt": "2026-06-08T12:00:00.000Z",
  "files": [
    {
      "path": "index.html",
      "size": 2048,
      "sha256": "...",
      "contentType": "text/html; charset=utf-8",
      "cacheControl": "no-cache"
    },
    {
      "path": "assets/index-a1b2c3.js",
      "size": 120000,
      "sha256": "...",
      "contentType": "application/javascript; charset=utf-8",
      "cacheControl": "public, max-age=31536000, immutable"
    }
  ]
}
```

### 6.3 运行时资源定位

`runtimePaths.ts` 提供统一路径解析：

```typescript
export interface RuntimePaths {
  executableDir: string;
  configPath: string;
  dataDir: string;
  logsDir: string;
  staticRoot: string;
}
```

打包后：

- `executableDir` 使用 `path.dirname(process.execPath)`。
- `configPath` 为 `path.join(executableDir, "config.json")`。
- `staticRoot` 指向 pkg 快照中的 `dist-static` 目录。

开发模式：

- `executableDir` 可退化为 `process.cwd()`。
- `staticRoot` 可指向 `src/backend/dist-static` 或 `src/frontend/dist`。

需要通过 `process.pkg` 或等价判断区分 pkg 运行态与开发态。

### 6.4 静态资源服务接口

```typescript
export interface StaticAssetInfo {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
  cacheControl: string;
}

export interface StaticAssetService {
  hasAsset(requestPath: string): boolean;
  readAsset(requestPath: string): Promise<Uint8Array>;
  getAssetInfo(requestPath: string): StaticAssetInfo | null;
  readIndexHtml(): Promise<Uint8Array>;
}
```

`StaticAssetService` 初始化时加载 `asset-manifest.json`，并建立 `Map<string, StaticAssetInfo>`。

路径规则：

- 请求路径先 `decodeURIComponent`。
- 去除开头 `/`。
- 空路径映射为 `index.html`。
- 使用 `path.posix.normalize` 归一化。
- 若归一化后包含 `..` 或以 `/` 开头，拒绝访问。
- 只允许访问 manifest 中存在的文件。

---

## 7. Hono 路由设计

### 7.1 路由注册顺序

推荐路由顺序：

```typescript
const app = new Hono();

app.use("*", requestLogger);

app.get("/api/health", healthHandler);
app.route("/api/system-logs", createSystemLogRoutes(systemLogService));
app.route("/api/objects", createObjectStoreRoutes(objectStore, dataDir));
app.route("/api/artifacts", createArtifactRoutes(artifactService));
app.route("/api/solutions", createSolutionRoutes(solutionService));
app.route("/api/solutions/:solutionId/robots", createRobotRoutes(robotService));
app.route("/api/memstore", createMemStoreRoutes(memStoreInstance));
app.route("/api/sse", createSseRoutes(sseManager));
app.route("/api/flows", createTaskFlowRoutes(taskFlowEngine));

app.route("/", createStaticRoutes(staticAssetService));

app.notFound(notFoundHandler);
app.onError(errorHandler);
```

API 路由必须先于静态资源和 SPA 兜底注册。

### 7.2 静态资源路由行为

`createStaticRoutes(staticAssetService)` 行为：

| 请求 | 响应 |
|------|------|
| `GET /` | 返回 `index.html` |
| `HEAD /` | 返回 `index.html` 头信息 |
| `GET /assets/index-xxx.js` | 返回对应资源 |
| `GET /favicon.ico` | 若 manifest 存在则返回资源，否则 404 |
| `GET /solutions/123` | 返回 `index.html` |
| `GET /api/unknown` | 不进入 SPA fallback，由 API notFound 返回 JSON 错误 |
| `POST /solutions/123` | 404，不返回 `index.html` |
| `GET /assets/not-found.js` | 404，不返回 `index.html` |

### 7.3 SPA fallback 判定

```typescript
function shouldReturnSpaIndex(method: string, path: string): boolean {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }
  if (path === "/" || path === "") {
    return true;
  }
  if (path.startsWith("/api/")) {
    return false;
  }
  if (looksLikeStaticFile(path)) {
    return false;
  }
  return true;
}
```

`looksLikeStaticFile` 规则：路径最后一段包含扩展名时视为静态文件请求，例如 `.js`、`.css`、`.png`、`.svg`、`.ico`、`.woff2`、`.map`。

### 7.4 响应头设计

| 文件类型 | Content-Type | Cache-Control |
|----------|--------------|---------------|
| `index.html` | `text/html; charset=utf-8` | `no-cache` |
| `.js` | `application/javascript; charset=utf-8` | `public, max-age=31536000, immutable` |
| `.css` | `text/css; charset=utf-8` | `public, max-age=31536000, immutable` |
| `.json` | `application/json; charset=utf-8` | `no-cache` |
| 图片 / 字体 | 按扩展名映射 | `public, max-age=31536000, immutable` |

若静态资源带 Vite hash 文件名，使用长期缓存；`index.html` 不长期缓存。

---

## 8. 外置配置设计

### 8.1 配置类型

```typescript
export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  database: {
    path: string;
  };
  security: {
    secret: string;
  };
  logs: {
    level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
    dir: string;
  };
  runtime: {
    mock: boolean;
  };
}
```

默认配置：

```typescript
export const defaultAppConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 30001,
  },
  database: {
    path: "./data/robotops.db",
  },
  security: {
    secret: "change-me",
  },
  logs: {
    level: "info",
    dir: "./logs",
  },
  runtime: {
    mock: false,
  },
};
```

说明：默认端口沿用当前后端入口中的 `30001`，满足固定端口策略。

### 8.2 配置加载流程

```text
loadAppConfig(runtimePaths)
  │
  ├─ 判断 runtimePaths.configPath 是否存在
  │   ├─ 不存在：返回 defaultAppConfig，并记录使用默认配置
  │   └─ 存在：继续
  │
  ├─ 读取 config.json
  ├─ JSON.parse
  ├─ deepMerge(defaultAppConfig, userConfig)
  ├─ validateAppConfig(mergedConfig)
  ├─ normalizeRelativePaths(mergedConfig, executableDir)
  └─ 返回 AppConfig
```

### 8.3 校验规则

| 字段 | 校验规则 |
|------|----------|
| `server.host` | 非空字符串；默认 `127.0.0.1` |
| `server.port` | 整数，范围 `1..65535` |
| `database.path` | 非空字符串，可为相对路径或绝对路径 |
| `security.secret` | 非空字符串；允许默认值但生产发布应提示修改 |
| `logs.level` | `trace/debug/info/warn/error/fatal` 之一 |
| `logs.dir` | 非空字符串，可为相对路径或绝对路径 |
| `runtime.mock` | boolean |

相对路径解析规则：

- `database.path` 相对 `executableDir` 解析。
- `logs.dir` 相对 `executableDir` 解析。
- 其他业务后续新增路径字段默认也相对 `executableDir`，除非字段文档另行说明。

### 8.4 命令行参数兼容

当前后端支持 `--port`、`--data-dir`、`--mock`。打包设计建议保留命令行参数作为高级覆盖方式，但优先级应明确：

```text
默认配置 < config.json < 命令行参数
```

兼容映射：

| 命令行参数 | 配置字段 |
|------------|----------|
| `--port`, `-p` | `server.port` |
| `--data-dir`, `-d` | `database.path` 或对象存储数据目录 |
| `--mock`, `-m` | `runtime.mock` |

若命令行参数无效，应启动失败并输出字段级错误。

### 8.5 配置脱敏

日志中允许输出：

```typescript
log.info({
  configPath,
  configLoaded: true,
  server: config.server,
  databasePath: config.database.path,
  logsDir: config.logs.dir,
}, "Configuration loaded");
```

禁止输出：

- `security.secret`
- 密码
- Token
- 私钥
- 其他以后命名包含 `password`、`secret`、`token`、`key` 的敏感字段值

---

## 9. 启动流程设计

### 9.1 启动主流程

```text
index.ts
  │
  ├─ resolveRuntimePaths()
  ├─ loadAppConfig()
  ├─ configureLogger(config.logs)
  ├─ initializeDataDirectories()
  ├─ createServices(config)
  ├─ createApp(services, config)
  ├─ loadPersistedFlows()
  └─ serve({ fetch: app.fetch, hostname: config.server.host, port: config.server.port })
```

### 9.2 端口冲突处理

`@hono/node-server` 底层 HTTP server 出现 `EADDRINUSE` 时：

1. 捕获启动错误。
2. 记录 Pino error 日志：

```typescript
log.error({
  host: config.server.host,
  port: config.server.port,
  code: "EADDRINUSE",
}, "Port already in use");
```

3. 进程以非零状态退出。
4. 不尝试自动递增端口。

### 9.3 启动成功日志

启动成功后记录：

```typescript
log.info({
  host: config.server.host,
  port: config.server.port,
  url: `http://${config.server.host}:${config.server.port}`,
  configPath,
}, "RobotOps Studio started");
```

若 `host` 为 `0.0.0.0`，额外记录 warn：

```typescript
log.warn({ host: "0.0.0.0" }, "Server exposed on all interfaces");
```

---

## 10. 日志与运行目录设计

### 10.1 运行目录

打包后默认运行目录以可执行文件所在目录为基准：

```text
<executable-dir>/
├── robotops-studio(.exe)
├── config.json                    # 可选
├── data/                          # 默认数据目录
└── logs/                          # 默认日志目录
```

### 10.2 日志配置调整

当前日志模块固定写入 `./logs/app`。打包设计建议将日志目录改为由配置注入：

```typescript
configureLogger({
  level: config.logs.level,
  dir: config.logs.dir,
});
```

`pino-roll` 文件路径使用：

```text
<logs.dir>/app
```

系统日志模块读取目录与 Pino 写入目录必须使用同一个 `config.logs.dir`，避免打包后工作目录变化导致 UI 读取不到日志。

---

## 11. 压缩设计

### 11.1 压缩策略

推荐使用可选压缩层，构建脚本通过环境变量控制：

```text
PACKAGE_COMPRESS=auto|on|off
```

默认值：`auto`。

| 模式 | 行为 |
|------|------|
| `on` | 压缩工具不可用或压缩失败时构建失败 |
| `off` | 跳过压缩 |
| `auto` | 有可用压缩工具则压缩；不可用则记录明确 warn 并继续 |

### 11.2 压缩工具

优先采用项目本地 npm 依赖或无需系统安装的方式。可选方案：

1. 使用 npm 本地依赖封装 UPX 二进制。
2. 使用平台内置压缩发布包，但不改变单文件可执行本体。
3. 若无法稳定跨平台压缩，则保留未压缩二进制并记录体积。

不得在构建脚本中自动执行系统级安装。

### 11.3 压缩后校验

每个压缩后的产物需校验：

- 文件存在且大小大于 0。
- 非 Windows 产物有可执行权限。
- 当前宿主平台对应产物可执行 `--version` 或 `--health-check`。
- 压缩后文件大小不大于压缩前；若变大，保留压缩前版本并记录 warn。

---

## 12. 产物组织设计

### 12.1 release 目录

```text
release/
├── windows-amd64/
│   ├── robotops-studio.exe
│   └── config.example.json
├── macos-amd64/
│   ├── robotops-studio
│   └── config.example.json
├── macos-arm64/
│   ├── robotops-studio
│   └── config.example.json
├── linux-amd64/
│   ├── robotops-studio
│   └── config.example.json
└── linux-arm64/
    ├── robotops-studio
    └── config.example.json
```

### 12.2 config.example.json

示例文件：

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 30001
  },
  "database": {
    "path": "./data/robotops.db"
  },
  "security": {
    "secret": "change-me-before-use"
  },
  "logs": {
    "level": "info",
    "dir": "./logs"
  },
  "runtime": {
    "mock": false
  }
}
```

发布目录仅提供 `config.example.json`。用户如需修改配置，应复制为 `config.json` 后编辑。

### 12.3 文件命名

pkg 原始输出可使用平台完整名称：

```text
robotops-studio-windows-amd64.exe
robotops-studio-macos-amd64
robotops-studio-macos-arm64
robotops-studio-linux-amd64
robotops-studio-linux-arm64
```

整理到平台目录后统一命名为：

- Windows：`robotops-studio.exe`
- macOS / Linux：`robotops-studio`

---

## 13. 兼容性与 ESM 打包注意事项

### 13.1 ESM 与 pkg

项目后端 `package.json` 当前为：

```json
{
  "type": "module"
}
```

设计上继续保持 ESM，不切换到 CommonJS。实现时需验证 `pkg` 对当前 Node 目标和 ESM 输出的支持情况。

若发现 `pkg` 对直接 ESM 入口支持不足，优先采用构建层适配，而不是改写业务源码为 CommonJS：

- 使用 TypeScript 编译生成兼容输出。
- 或使用本地 bundler 将后端入口打包为 pkg 可识别的单入口 ESM/CJS 包装产物。
- 业务源码仍保持 TypeScript + ES6 module。

### 13.2 动态导入与动态路径

`pkg` 对动态路径分析有限。实现中应避免：

```typescript
await import(userInput);
fs.readFile(path.join(base, dynamicName)); // 未纳入 assets 时
```

对确需动态访问的资源，应满足：

- 路径来自 manifest 白名单。
- 文件目录明确写入 `pkg.config.json.assets`。
- 构建后执行产物启动校验。

### 13.3 原生依赖

若后端新增原生 Node 依赖，需要确认：

- 是否支持目标平台架构。
- 是否能被 `pkg` 正确打包。
- 是否需要外置 `.node` 文件。

若需要外置原生模块，则会破坏单文件交付目标，应优先替换为纯 JavaScript/TypeScript 依赖。

---

## 14. 验证与测试设计

### 14.1 构建期验证

`verify-release.ts` 执行以下检查：

```text
for each target:
  assert release/<target>/robotops-studio(.exe) exists
  assert file size > 0
  assert config.example.json exists
  assert no node_modules in release/<target>
  assert no dist directory in release/<target>
  assert non-windows executable mode includes x bit
```

### 14.2 当前宿主平台启动验证

在构建机当前平台上，对匹配产物执行 smoke test：

```text
robotops-studio --port <free-test-port> --health-check
```

若实现 `--health-check` 不启动长驻服务，则该命令应检查：

- 配置加载。
- 内嵌 `index.html` 存在。
- asset manifest 可解析。
- 关键后端模块可初始化。

若实现端到端启动测试，则流程为：

1. 启动当前平台二进制并指定测试端口。
2. 请求 `GET /api/health`，期望 200。
3. 请求 `GET /`，期望 `Content-Type: text/html`。
4. 请求一个前端路由，如 `/solutions/test`，期望返回 `index.html`。
5. 请求 `/api/not-found`，期望 JSON 404，不是 HTML。
6. 停止进程。

### 14.3 手工跨平台验收

每个目标平台至少执行：

- 空目录启动。
- 无 `config.json` 默认配置启动。
- 复制 `config.example.json` 为 `config.json` 并修改端口后启动。
- 端口占用场景启动失败。
- 首页访问。
- 前端子路由刷新。
- `/api/health` 响应。
- 删除外部 `dist` 后仍能访问静态资源。

---

## 15. 错误处理设计

| 场景 | 处理方式 |
|------|----------|
| 前端构建失败 | 构建脚本立即退出，输出失败步骤与命令。 |
| `dist/index.html` 缺失 | `prepare-frontend-assets.ts` 失败。 |
| asset manifest 缺失 | 程序启动失败并记录 `Static asset manifest missing`。 |
| `config.json` JSON 非法 | 程序启动失败，记录配置路径与解析错误，不输出敏感内容。 |
| 配置字段非法 | 程序启动失败，记录字段路径。 |
| 端口被占用 | 程序启动失败，记录 host/port/code，提示修改配置。 |
| `/api/**` 未匹配 | 返回 JSON 404。 |
| 静态资源未匹配且像文件 | 返回 404。 |
| 前端路由刷新 | 返回 `index.html`。 |
| 压缩工具不可用 | 根据 `PACKAGE_COMPRESS` 策略失败或 warn 后继续。 |

---

## 16. 安全设计

1. 默认监听 `127.0.0.1`，避免无意暴露到局域网。
2. 支持配置 `0.0.0.0`，但启动时必须输出 warn。
3. 静态资源访问基于 manifest 白名单，禁止目录穿越。
4. 配置日志脱敏，禁止输出密钥、密码、Token。
5. `config.example.json` 不包含真实密钥。
6. release 目录不得包含 `.env`、真实 `config.json`、凭据文件或开发缓存。
7. 打包脚本只使用项目本地依赖，不执行系统级安装。

---

## 17. 需求追踪矩阵

| 需求编号 | 设计章节 |
|----------|----------|
| FR-PKG-001 支持平台 | 5.3、12.1 |
| FR-PKG-002 单文件交付 | 3、12 |
| FR-PKG-003 产物目录 | 12.1 |
| FR-PKG-004 Vite 静态构建 | 5.2、6 |
| FR-PKG-005 前端资源内嵌 | 6 |
| FR-PKG-006 pkg 打包 | 5.3、5.4、13 |
| FR-PKG-007 一键全平台命令 | 5.1、5.2 |
| FR-PKG-008 压缩能力 | 11 |
| FR-PKG-009 内置 HTTP 服务 | 7、9 |
| FR-PKG-010 浏览器访问方式 | 1、9.3 |
| FR-PKG-011 API 与静态资源分离 | 7.1、7.2 |
| FR-PKG-012 SPA 兜底路由 | 7.3 |
| FR-PKG-013 固定端口冲突处理 | 9.2 |
| FR-PKG-014 JSON 配置文件 | 8 |
| FR-PKG-015 配置查找规则 | 8.2 |
| FR-PKG-016 配置内容 | 8.1、8.3 |
| FR-PKG-017 配置安全 | 8.5、16 |
| NFR-PKG-001 兼容性 | 5.3、13、14 |
| NFR-PKG-002 可用性 | 9.3、12.2 |
| NFR-PKG-003 可诊断性 | 15 |
| NFR-PKG-004 安全性 | 16 |
| NFR-PKG-005 性能 | 6.4、7.4、11 |

---

## 18. 分阶段实施建议

### 阶段一：运行时结构改造

- 拆分 `createApp()` 与 `startServer()`。
- 增加 `appConfig.ts`，支持运行路径解析、`config.json` 与命令行覆盖。
- 将日志目录、数据目录、端口改为配置驱动。

### 阶段二：静态资源服务

- 增加 `prepare-frontend-assets.ts`。
- 增加 `StaticAssetService` 与 `createStaticRoutes()`。
- 接入 Hono 路由，完成 SPA fallback。
- 本地验证 `npm run build` 后后端可托管前端。

### 阶段三：pkg 打包

- 增加后端 TypeScript build 配置。
- 增加 `src/package.json` 编排入口与本地 `pkg` 依赖。
- 增加后端 `pkg.config.json`。
- 通过 `src/package.json` 的 `package:all` 生成五个平台原始二进制。

### 阶段四：压缩与发布目录

- 实现 `compress-binaries.ts`。
- 实现 `assembleReleaseDirs()`。
- 生成 `config.example.json`。
- 实现 `verify-release.ts`。

### 阶段五：跨平台验收

- 在 Windows、macOS Intel、macOS Apple Silicon、Linux amd64、Linux arm64 上执行手工验收。
- 修复 pkg assets、权限、路径分隔符、压缩兼容性问题。
- 固化 CI 或本地发布流程。

---

## 19. 待确认实现细节

以下事项在编码阶段需要结合实际依赖验证后最终固化：

1. 是否需要长期固定 `pkg@5.8.1` 与 Node 18 目标，或后续升级到可稳定下载 base binary 的新版 pkg。
2. 是否需要引入 bundler 适配 ESM 与 pkg。
3. 压缩工具选型及是否默认开启。
4. `database.path` 与当前对象存储 `dataDir` 的最终字段命名是否统一。
5. 是否新增 `--health-check` 与 `--version` 命令。
6. 根目录是否新增统一 `package.json` 来聚合前后端构建命令。
