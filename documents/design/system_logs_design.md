# 系统日志模块 — 软件设计文档

> 本文档承接《系统日志模块需求规格说明书》，对需求中涉及的技术实现进行设计细化。

---

## 1. 概述

本文档描述系统日志模块的后端服务结构、API 详细规约、文件读取策略、流式打包方案，以及前端组件结构与状态管理设计。模块作为顶层模块嵌入 RobotOps Studio，与 Solutions / Artifacts 同级。

---

## 2. 设计约束

- 后端运行于 Node.js + Hono；遵循项目现有 ESM + TypeScript 规范。
- 仅以只读方式访问 `src/backend/logs/` 目录，禁止任何写入、删除、重命名操作。
- 不修改 `src/backend/src/logger/index.ts`（Pino 配置）。
- 模块内部所有日志输出使用 `createLogger("SystemLog")` 或 `createLogger("SystemLogRoute")`。
- 不引入新的全局状态；查询/下载均为无状态请求。
- 路径访问严格白名单：文件名只允许匹配 `^app\.\d+\.log$`。

---

## 3. 总体架构

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│  SystemLogsView                                           │
│   ├── LogFileTable                                        │
│   ├── LogQueryToolbar (TimeRange + LevelFilter +          │
│   │    ModuleFilter + KeywordSearch + RefreshButton +      │
│   │    DownloadButton)                                     │
│   ├── LogEntryTable (virtual scroll)                      │
│   └── DownloadButton                                      │
│         │                                                  │
│         ▼ via systemLogApi.ts                              │
└──────────────────────────────────────────────────────────┘
                            │ HTTP /api/system-logs/*
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    Backend (Hono)                          │
│  systemLogRoutes.ts                                       │
│         │                                                  │
│         ▼                                                  │
│  SystemLogService                                          │
│   ├── listFiles()             ──► fs.readdir + stat       │
│   ├── listModules()           ──► sample tail scan        │
│   ├── query(req)              ──► reverse stream scan     │
│   ├── createBundleStream(req) ──► archiver stream         │
│   └── createFileStream(name)  ──► fs.createReadStream     │
│                                                            │
│  helpers/                                                  │
│   ├── fileNameGuard.ts        (regex whitelist)            │
│   ├── pinoEntryParser.ts      (line → LogEntry)            │
│   └── timeRangeIndex.ts       (firstTs/lastTs cache)       │
└──────────────────────────────────────────────────────────┘
                            │ fs read-only
                            ▼
                  src/backend/logs/app.<N>.log
                  (owned and written by pino-roll)
```

---

## 4. 后端设计

### 4.1 目录结构

```
src/backend/src/
├── routes/
│   └── systemLogRoutes.ts        (新增)
├── services/
│   └── systemLogService.ts       (新增)
├── helpers/                       (新增子目录)
│   ├── fileNameGuard.ts
│   ├── pinoEntryParser.ts
│   └── timeRangeIndex.ts
└── types/
    └── systemLog.ts              (新增)
```

### 4.2 类型定义（`types/systemLog.ts`）

```typescript
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogFileInfo {
  name: string;
  size: number;
  mtime: string;
  firstTs?: string;
  lastTs?: string;
  isActive: boolean;
}

export interface LogEntry {
  time: string;
  level: LogLevel;
  module?: string;
  msg: string;
  extra: Record<string, unknown>;
  raw?: string;
}

export interface LogQueryRequest {
  from?: string;
  to?: string;
  levels?: LogLevel[];
  modules?: string[];
  q?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

export interface LogQueryResponse {
  entries: LogEntry[];
  nextCursor?: string;
  truncated: boolean;
  parseErrorCount: number;
}

export interface LogBundleRequest {
  from: string;
  to: string;
}

export interface LogBundleManifest {
  requestedFrom: string;
  requestedTo: string;
  generatedAt: string;
  studioVersion: string;
  files: Array<{
    name: string;
    size: number;
    mtime: string;
    firstTs?: string;
    lastTs?: string;
  }>;
}
```

### 4.3 SystemLogService

#### 4.3.1 接口

```typescript
export interface SystemLogService {
  listFiles(): Promise<LogFileInfo[]>;
  listModules(sampleLines?: number): Promise<string[]>;
  query(req: LogQueryRequest): Promise<LogQueryResponse>;
  createBundleStream(req: LogBundleRequest): {
    fileName: string;
    contentType: "application/zip";
    stream: ReadableStream<Uint8Array>;
  };
  createFileStream(name: string): {
    contentType: "application/octet-stream";
    size: number;
    stream: ReadableStream<Uint8Array>;
  };
}
```

#### 4.3.2 构造参数

```typescript
interface SystemLogServiceOptions {
  logsDir: string;                 // 默认 path.resolve(__dirname, "../logs")
  fileNameRegex?: RegExp;          // 默认 /^app\.\d+\.log$/
  defaultWindowMs?: number;        // 默认 30 * 60 * 1000
  defaultLimit?: number;           // 默认 500
  maxLimit?: number;               // 默认 1000
  studioVersion: string;           // 由 index.ts 注入（package.json.version）
}
```

#### 4.3.3 listFiles 实现策略

1. `fs.readdir(logsDir)`，按 `fileNameRegex` 过滤。
2. 对每个文件 `fs.stat` 获取 `size`、`mtime`。
3. 通过 `timeRangeIndex.peekFirstAndLast(filePath)` 读取首末时间戳：
   - 首条：从文件头读前 64 KB，截取第一个完整 JSON 行 → 解析 `time` 字段。
   - 末条：从文件尾反向读 64 KB，截取最后一个完整 JSON 行 → 解析 `time` 字段。
   - 任一解析失败则对应字段省略。
4. `isActive`：选 `mtime` 最新且文件名编号最大者标记为 `true`（pino-roll 默认追加到编号最大的当前文件）。
5. 结果按文件名自然排序（`app.1.log < app.2.log < app.10.log` 用数字段比较）。

#### 4.3.4 listModules 实现策略

1. 取所有文件按 `mtime` 倒序最新的前 N（默认 2）个。
2. 反向读尾部 `sampleLines`（默认 5000）行。
3. 解析 `module` 字段去重，与附录 A 的静态清单合并。
4. 加入虚拟模块 `(none)`。
5. 结果按字母排序返回。

#### 4.3.5 query 实现策略

**核心算法：反向流式扫描 + 早退出**

```
to    := req.to    ?? now
from  := req.from  ?? to - defaultWindowMs
order := req.order ?? "desc"
limit := min(req.limit ?? defaultLimit, maxLimit)

files := listFiles()
       |> 按数字编号倒序（活跃文件优先）
       |> 过滤掉 lastTs < from 或 firstTs > to 的文件
       |> 注：lastTs/firstTs 缺失时不过滤（保守保留）

cursor := parseCursor(req.cursor)   // {fileName, byteOffset} | undefined

results := []
parseErrorCount := 0

for each file in files (从 cursor 指定文件开始；若无 cursor 从首个开始):
  for each line in reverse(file, startOffset=cursor.byteOffset):
    entry := parsePinoLine(line)
    if entry.parseError:
      parseErrorCount++
      continue
    if entry.time > to: continue          // 还没到时间窗
    if entry.time < from: break outer     // 早退出：再往前已无意义
    if not matchLevels(entry, req.levels): continue
    if not matchModules(entry, req.modules): continue
    if not matchKeyword(entry, req.q): continue
    results.push(entry)
    if results.length >= limit:
      nextCursor := encodeCursor({fileName: file, byteOffset: 当前位置})
      break outer

if order == "asc": results.reverse()
return { entries: results, nextCursor, truncated: !!nextCursor, parseErrorCount }
```

**反向读取实现**：使用 `fs.createReadStream` 配合手动 chunk 拼接（64KB 块），从末尾向头部读取，按 `\n` 切分。考虑跨块边界的不完整行：每次读取保留前一块的不完整片段。

**游标格式**：

```
cursor := base64url(JSON.stringify({ f: "app.2.log", o: 12345678 }))
```

`f` = 文件名，`o` = 下次扫描应从该文件的此字节偏移**之前**继续向头部扫描。

#### 4.3.6 createBundleStream 实现

依赖：`archiver`（流式 zip 库，需通过 `npm install archiver @types/archiver`）。

```
async createBundleStream(req):
  files := listFiles()
  selected := files.filter(f => intersectsTimeWindow(f, req.from, req.to))
  // intersectsTimeWindow：
  //   若 firstTs/lastTs 都有 → 区间相交判定
  //   若任一缺失           → 保守纳入（避免漏数据）

  manifest := {
    requestedFrom: req.from,
    requestedTo:   req.to,
    generatedAt:   new Date().toISOString(),
    studioVersion,
    files: selected.map(toManifestEntry),
  }

  archive := archiver("zip", { store: true })  // store: 不压缩，速度优先
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" })
  for f of selected:
    archive.file(path.join(logsDir, f.name), { name: f.name })
  archive.finalize()  // 不 await

  fileName := buildBundleFileName(req.from, req.to)
  return { fileName, contentType: "application/zip", stream: nodeToWebStream(archive) }
```

**zip 命名**：

```typescript
function buildBundleFileName(from: string, to: string): string {
  const fmt = (iso: string) =>
    iso.replace(/[-:T.Z]/g, "").slice(0, 14); // YYYYMMDDHHmmss
  return `robotops-logs-${fmt(from)}-${fmt(to)}.zip`;
}
```

**异常处理**：archiver 在打包中遇到文件读取错误时 emit `error`，路由层捕获后销毁底层 socket（HTTP 已 200 时无法改状态码，依靠客户端识别截断 zip）。

#### 4.3.7 createFileStream 实现

```
createFileStream(name):
  if not fileNameRegex.test(name): throw AppError("INVALID_LOG_FILE_NAME", 400)
  fullPath := path.join(logsDir, name)
  if not path.resolve(fullPath).startsWith(logsDir + path.sep):
    throw AppError("INVALID_LOG_FILE_NAME", 400)
  stat := await fs.stat(fullPath)        // ENOENT → AppError("LOG_FILE_NOT_FOUND", 404)
  stream := fs.createReadStream(fullPath, { end: stat.size - 1 })
  return { contentType: "application/octet-stream", size: stat.size, stream }
```

锁定读取长度到触发瞬间的文件大小（即便 Pino 仍在追加，下载内容也只到触发时长度）。

### 4.4 路由层（`routes/systemLogRoutes.ts`）

| 方法 | 路径 | 处理 |
|------|------|------|
| GET  | `/files` | `c.json({ files: await service.listFiles() })` |
| GET  | `/modules` | `c.json({ modules: await service.listModules() })` |
| GET  | `/query` | 解析 query 参数 → 调 `service.query(req)` → 返回 `LogQueryResponse` |
| POST | `/download` | 解析 body → 调 `service.createBundleStream(req)` → 返回流式 200 |
| GET  | `/files/:name/download` | 调 `service.createFileStream(name)` → 返回流式 200 |

#### 4.4.1 查询参数解析（`/query`）

| 查询字符串 | 类型 | 说明 |
|-----------|------|------|
| `from`, `to` | ISO 8601 字符串 | 可选 |
| `levels` | 逗号分隔，如 `info,warn,error` | 可选 |
| `modules` | 逗号分隔；`(none)` 字面量保留 | 可选 |
| `q` | 字符串 | 可选 |
| `order` | `asc` / `desc` | 可选 |
| `limit` | 整数 1..1000 | 可选 |
| `cursor` | base64url 字符串 | 可选 |

无效参数返回 `AppError("INVALID_LOG_QUERY", 400)`，附带具体字段错误信息。

#### 4.4.2 在 `index.ts` 中挂载

```typescript
import { createSystemLogService } from "./services/systemLogService.js";
import { createSystemLogRoutes } from "./routes/systemLogRoutes.js";

const systemLogService = createSystemLogService({
  logsDir: path.resolve(__dirname, "../logs"),
  studioVersion: pkg.version,
});

app.route("/api/system-logs", createSystemLogRoutes(systemLogService));
```

### 4.5 错误码

| 错误码 | HTTP 状态 | 触发条件 |
|--------|-----------|----------|
| `INVALID_LOG_QUERY` | 400 | query 参数格式错误 |
| `INVALID_LOG_FILE_NAME` | 400 | 文件名不符合白名单或包含穿越意图 |
| `LOG_FILE_NOT_FOUND` | 404 | 指定文件不存在 |
| `LOGS_DIR_UNAVAILABLE` | 503 | `logs/` 目录无法读取（非"目录不存在"） |
| `LOG_BUNDLE_FAILED` | 500 | zip 流尚未开始就失败的兜底 |

> 注：`logs/` 目录不存在时，`listFiles` 返回空数组，不抛错。

---

## 5. 前端设计

### 5.1 目录结构

```
src/frontend/src/
├── api/
│   └── systemLogApi.ts            (新增)
├── components/
│   └── system-logs/                (新增子目录)
│       ├── SystemLogsView.tsx
│       ├── LogFileTable.tsx
│       ├── LogQueryToolbar.tsx
│       ├── LogEntryTable.tsx
│       ├── LogEntryDetailDrawer.tsx
│       └── LogDownloadButton.tsx
├── hooks/
│   ├── useLogFiles.ts              (新增)
│   ├── useLogModules.ts            (新增)
│   └── useLogQuery.ts              (新增)
└── types/
    └── systemLog.ts                (新增)
```

### 5.2 顶层导航接入（修改 `App.tsx`）

```typescript
type TopView = "solutions" | "artifacts" | "system-logs";
```

在 `HeaderNavigation` 中追加：

```tsx
<HeaderMenuItem
  onClick={() => { setCurrentView("system-logs"); if (inWorkspace) setInWorkspace(false); }}
  isActive={currentView === "system-logs"}
>
  System Logs
</HeaderMenuItem>
```

在主区域条件渲染：

```tsx
{currentView === "system-logs" && <SystemLogsView />}
```

### 5.3 API 客户端（`api/systemLogApi.ts`）

```typescript
import { apiFetch } from "./client.js";
import type {
  LogFileInfo, LogEntry, LogQueryRequest, LogQueryResponse, LogBundleRequest,
} from "../types/systemLog.js";

export const systemLogApi = {
  async listFiles(): Promise<LogFileInfo[]> { /* GET /api/system-logs/files */ },
  async listModules(): Promise<string[]>    { /* GET /api/system-logs/modules */ },
  async query(req: LogQueryRequest): Promise<LogQueryResponse> {
    /* GET /api/system-logs/query?from=...&to=...&levels=... */
  },
  bundleDownloadUrl(req: LogBundleRequest): string {
    // 返回 POST 地址；由组件层使用 fetch + Blob + anchor 触发下载
  },
  fileDownloadUrl(name: string): string {
    return `/api/system-logs/files/${encodeURIComponent(name)}/download`;
  },
};
```

### 5.4 视图组件（`SystemLogsView.tsx`）

布局（Carbon Grid）：

```
┌────────────────────────────────────────────────────────────┐
│ Header                                                      │
├──────────────────────┬──────────────────────────────────────┤
│ LogFileTable         │ LogQueryToolbar                      │
│  (左侧 30%)           │  ├ TimeRangePicker (default 30min)   │
│   - name             │  ├ LevelFilter (multiselect)          │
│   - size             │  ├ ModuleFilter (multiselect)         │
│   - mtime            │  ├ KeywordSearch                      │
│   - Active badge     │  ├ RefreshButton                       │
│   - Download btn     │  └ LogDownloadButton                  │
│   - Download btn     ├──────────────────────────────────────┤
│                      │ LogEntryTable (virtual scroll)        │
│                      │  - time / level / module / msg        │
│                      │  - 单击行 → LogEntryDetailDrawer       │
│                      │  - 滚到底部 → 自动 nextCursor 续拉     │
└──────────────────────┴──────────────────────────────────────┘
```

#### 状态管理

- 工具栏状态用单一 `LogQueryRequest` 对象，置于 `useLogQuery` hook 内。
- 工具栏字段变更 → 触发 `useLogQuery` 重新 fetch 首页（清空已有 entries，重置 cursor）。
- 点击 Refresh 按钮 → 递增 `refreshId` 计数器，触发 `buildQueryRequest` 重新计算时间戳（相对时间窗更新为 now），并同时调用 `refreshFiles()` / `refreshModules()` 重新拉取文件列表与模块列表。
- 滚动触底（IntersectionObserver） → 调用 `loadNextPage` 追加 entries。
- `parseErrorCount > 0` 时表格顶部显示 Carbon `InlineNotification` 提示行数。

#### useLogQuery 草案

```typescript
function useLogQuery(req: LogQueryRequest) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [cursor, setCursor]   = useState<string | undefined>();
  const [truncated, setTruncated] = useState(false);
  const [parseErrors, setParseErrors] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // 当 req 变化时（去除 cursor）→ 清空重新拉
  useEffect(() => { reload(); }, [memoKey(req)]);

  async function reload() { /* fetch with no cursor */ }
  async function loadNextPage() { /* fetch with cursor; append */ }

  return { entries, truncated, parseErrors, loading, error, loadNextPage, reload };
}
```

### 5.5 时间窗交互细节

- TimeRangePicker 默认 "Last 30 minutes"，提供快捷选项 + 自定义起止时间。
- 选择"Last X minutes/hours/days" 类相对窗口时，前端在每次发起请求前重新计算绝对时间戳。
- 用户切换自定义时间段后，时间戳"冻结"，不再随 now 变化。
- 时间选择器与查询同步，无需点击"Apply"按钮（防抖 300ms）。

### 5.6 Refresh 交互

```typescript
const [refreshId, setRefreshId] = useState(0);

// refreshId 作为 buildQueryRequest 的依赖项，用于强制重新计算时间戳
const buildQueryRequest = useCallback((): LogQueryRequest => {
  // ... 构建查询（每次 refreshId 变化时重新计算 to = new Date()）
}, [quickRangeIdx, customFrom, customTo, selectedLevels, selectedModules, searchQ, refreshId]);

async function handleRefresh() {
  setRefreshLoading(true);
  try {
    await Promise.all([refreshFiles(), refreshModules()]);
    setRefreshId((id) => id + 1);  // 触发 query re-fetch（相对时间窗会重新计算 now）
  } finally {
    setRefreshLoading(false);
  }
}
```

- Refresh 按钮位于工具栏右侧，与 Download zip 按钮并列。
- 刷新过程中按钮显示 loading 状态并禁用。
- 刷新不重置等级/模块/关键字筛选条件。
- 相对时间窗（如"Last 30 min"）的查询时间戳更新为当前时间；自定义绝对时间窗的时间戳保持不变。

### 5.7 下载交互

#### 时间段打包下载

```typescript
async function handleBundleDownload(req: LogBundleRequest) {
  const res = await fetch("/api/system-logs/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) { /* show error */ return; }
  const blob = await res.blob();
  const fileName = parseAttachmentFileName(res.headers.get("Content-Disposition"))
                ?? `robotops-logs-${Date.now()}.zip`;
  triggerDownload(blob, fileName);
}
```

#### 单文件下载

直接使用 `<a href={fileDownloadUrl(name)} download={name}>Download</a>`，浏览器原生触发。

---

## 6. 关键算法详解

### 6.1 反向流式读取

```typescript
async function* reverseLineStream(filePath: string, startOffset?: number) {
  const fd = await fs.promises.open(filePath, "r");
  try {
    const stat = await fd.stat();
    let pos = startOffset ?? stat.size;
    const CHUNK = 64 * 1024;
    let tail = "";   // 当前未消费的尾部字符串
    while (pos > 0) {
      const readSize = Math.min(CHUNK, pos);
      pos -= readSize;
      const buf = Buffer.alloc(readSize);
      await fd.read(buf, 0, readSize, pos);
      const text = buf.toString("utf8") + tail;
      const newlineIdx = text.indexOf("\n");
      // 第一段（在第一个 \n 之前的部分）可能不完整，留到下次拼接
      const firstFragment = newlineIdx >= 0 ? text.slice(0, newlineIdx) : text;
      const remainder     = newlineIdx >= 0 ? text.slice(newlineIdx + 1) : "";
      // 反向 yield remainder 中的每一行
      const lines = remainder.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.length > 0) yield { line, offsetBefore: pos };
      }
      tail = firstFragment;
    }
    if (tail.length > 0) yield { line: tail, offsetBefore: 0 };
  } finally {
    await fd.close();
  }
}
```

### 6.2 Pino 行解析（`pinoEntryParser.ts`）

```typescript
const LEVEL_MAP: Record<number, LogLevel> = {
  10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal",
};

const RESERVED = new Set(["time", "level", "module", "msg", "name", "pid", "hostname", "v"]);

export function parsePinoLine(line: string): LogEntry | { parseError: true; raw: string } {
  let obj: any;
  try { obj = JSON.parse(line); }
  catch { return { parseError: true, raw: line }; }

  const time = typeof obj.time === "string" ? obj.time : new Date(obj.time).toISOString();
  const level = LEVEL_MAP[obj.level] ?? "info";
  const module = typeof obj.module === "string" ? obj.module : undefined;
  const msg = typeof obj.msg === "string" ? obj.msg : "";
  const extra: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) if (!RESERVED.has(k)) extra[k] = obj[k];
  if (!LEVEL_MAP[obj.level]) extra.levelRaw = obj.level;
  return { time, level, module, msg, extra };
}
```

### 6.3 文件名守卫（`fileNameGuard.ts`）

```typescript
const SAFE = /^app\.\d+\.log$/;

export function assertSafeLogFileName(name: string): void {
  if (!SAFE.test(name)) {
    throw new AppError("INVALID_LOG_FILE_NAME", 400, `Invalid log file name: ${name}`);
  }
}

export function resolveLogFilePath(logsDir: string, name: string): string {
  assertSafeLogFileName(name);
  const full = path.resolve(logsDir, name);
  if (!full.startsWith(path.resolve(logsDir) + path.sep)) {
    throw new AppError("INVALID_LOG_FILE_NAME", 400, `Path escape attempt: ${name}`);
  }
  return full;
}
```

---

## 7. 依赖与配置

### 7.1 新增 npm 依赖

| 包 | 用途 | 版本约束 |
|----|------|----------|
| `archiver` | 流式 zip 打包 | ^7 |
| `@types/archiver` | TypeScript 类型 | ^6 |

仅在后端（`src/backend`）添加，不污染前端。

### 7.2 无新增环境变量

模块所有配置项均通过 `createSystemLogService` 构造参数传入，无需新增 env。

---

## 8. 日志（本模块自身）

| 场景 | 等级 | 字段示例 |
|------|------|---------|
| 模块启动 | info | `{ msg: "SystemLog service initialized", logsDir, defaultWindowMs }` |
| 查询请求 | debug | `{ msg: "query", from, to, levels, modules, q, limit }` |
| 查询完成 | info | `{ msg: "query done", returned, parseErrorCount, durationMs }` |
| 下载触发 | info | `{ msg: "bundle download", from, to, fileCount }` |
| 单文件下载 | info | `{ msg: "file download", name, size }` |
| 行解析失败累计 | warn | `{ msg: "parse errors in scan", count }` |
| 目录无法读取 | error | `{ msg: "logs dir unavailable", err }` |

模块名统一：`createLogger("SystemLog")`、`createLogger("SystemLogRoute")`。

---

## 9. 性能预算

| 场景 | 目标 |
|------|------|
| 默认 30 分钟查询首页（活跃文件 < 50MB） | < 500ms |
| 跨 2 个 500MB 文件的查询首页 | < 2s |
| 单文件下载启动到首字节 | < 200ms |
| 时间段打包下载（5 个 500MB 文件） | 启动 < 1s，吞吐受限于磁盘 |
| 模块列表（缓存 30s） | < 200ms（命中缓存 < 5ms） |

`listModules` 结果在 service 实例内缓存 30 秒。

---

## 10. 安全考量

| 风险 | 缓解 |
|------|------|
| 目录穿越（`../`、绝对路径） | `assertSafeLogFileName` + `path.resolve` 二次校验 |
| 任意文件读取 | 白名单正则 + 仅在 `logsDir` 内访问 |
| 资源耗尽（超大时间窗 OOM） | 反向流式读取 + `limit` 上限 + zip `store` 模式 + 不在内存累积 |
| 信息泄漏 | 不在 API 错误响应中返回绝对路径；日志框架本身禁止打印密码/token 已由项目规范覆盖 |
| 并发与活跃文件追加 | 下载活跃文件时锁定到触发瞬间长度；查询反向读取不会与 Pino 追加冲突（appendOnly 写） |

---

## 11. 与现有模块的接入点

| 接入点 | 改动 |
|--------|------|
| `src/backend/src/index.ts` | 新增 service 构造 + 路由挂载（约 5 行） |
| `src/frontend/src/App.tsx` | 扩展 `TopView` 联合类型 + 新增 HeaderMenuItem + 新增条件渲染分支（约 10 行） |
| `src/backend/src/logger/index.ts` | **不修改** |
| `package.json`（backend） | 新增 `archiver`、`@types/archiver` 依赖 |

---

## 12. 测试策略

详见《系统日志模块测试用例文档》。要点：

- 单元测试：`pinoEntryParser`、`fileNameGuard`、`timeRangeIndex`、反向流式读取。
- 集成测试：构造临时 `logs/` 目录与若干样例文件，覆盖跨文件查询、游标续传、zip 内容验证。
- 安全测试：路径穿越输入全部用例。
- 性能基准：500MB 文件反向扫描首页延迟。

---

## 附录 A：与需求文档的字段映射

| 需求字段 | 设计字段 | 备注 |
|---------|---------|------|
| 等级 | `LogEntry.level` | 字符串化 Pino 数值 |
| 模块 | `LogEntry.module` | 来自 Pino `module` 字段 |
| 关键字 | `LogQueryRequest.q` | 大小写不敏感 includes |
| 默认 30 分钟 | `defaultWindowMs` | 后端常量 + 前端 TimeRangePicker 默认值 |
| 文件名白名单 | `fileNameRegex` | 默认 `/^app\.\d+\.log$/` |
| zip manifest | `LogBundleManifest` | 直接序列化为 `manifest.json` |
