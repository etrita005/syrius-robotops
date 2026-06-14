# 系统日志模块 — 需求规格说明书

## 1. 概述

系统日志模块（System Logs）是 RobotOps Studio 的顶层功能模块，与 Solutions、Artifacts 同级，面向 FAE、技术支持与开发人员，提供对 **RobotOps Studio 后端服务自身运行日志** 的在线查看与打包下载能力。

该模块的核心定位是 **只读视图**：仅消费后端 Pino 框架已写入磁盘的滚动日志文件，不参与日志的生成、滚动、保留与清理。

**关键用例**：

- 现场 FAE 在升级或诊断过程中遇到后端异常，需要在 GUI 内快速查看最近 30 分钟的后端日志并按等级/模块缩小排查范围。
- 技术支持需要将某一时间段的全部后端日志打包导出，发送给开发团队复盘。
- 运维人员需要直接下载某个滚动日志原始文件用于本地深度分析。

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **系统日志（System Log）** | RobotOps Studio 后端 Node.js 进程通过 Pino 框架写入磁盘的运行日志，区别于机器人侧日志与解决方案业务日志。 |
| **日志文件（Log File）** | 由 `pino-roll` 滚动产出的单个文件，命名形如 `app.<N>.log`，位于后端 `logs/` 目录。 |
| **日志条目（Log Entry）** | 日志文件中的一行 JSON 文本，对应一次 Pino 日志调用。 |
| **活跃文件（Active File）** | 当前 Pino 正在追加写入的滚动文件（通常为最新的 `app.<N>.log`）。 |
| **等级（Level）** | Pino 标准日志等级：trace / debug / info / warn / error / fatal。 |
| **模块（Module）** | 日志条目的 `module` 字段，由 `createLogger("ModuleName")` 注入，PascalCase。 |
| **时间窗（Time Window）** | 用户指定的查询起止时间区间，前闭后闭。 |
| **日志包（Log Bundle）** | 将与指定时间窗有交集的原始日志文件连同 `manifest.json` 打包形成的 zip 文件。 |

---

## 3. 设计原则

1. **只读不写**：本模块不向 `logs/` 目录写入、删除、重命名任何文件，不修改 Pino 配置，不调整 `LOG_LEVEL`，不影响后端日志的产生与保留。
2. **格式对齐**：直接使用 Pino 的 JSON Lines 输出格式，等级与模块字段语义与 `src/backend/src/logger/index.ts` 中定义保持一致。
3. **默认窗口短**：默认查询窗口为"最近 30 分钟"，以保护性能；用户可自由放大时间窗，无硬上限。
4. **流式优先**：查询采用分页/游标；下载采用流式 zip，避免一次性加载大文件至内存。
5. **路径透明**：UI 直接展示真实日志文件名（如 `app.1.log`），便于与运维侧线下沟通。
6. **路径安全**：所有文件访问严格限定在后端 `logs/` 目录，文件名只允许匹配 `^app\.\d+\.log$`，禁止任何形式的目录穿越。
7. **筛选维度复用 Pino 字段**：按等级（level）与模块（module）筛选，不引入新的 `category` 字段。

---

## 4. 非目标

以下能力 **明确不在本模块范围内**：

- ❌ 日志保留 / 自动清理 / 自定义滚动策略（这是 Pino/pino-roll 的职责，本模块不接管）。
- ❌ 实时跟随（tail/follow）与 SSE 推送（列入未来扩展）。注意：手动刷新按钮（FR-SL-06）属于本期范围，是一次性 pull 行为，与 SSE 持续推送有本质区别。
- ❌ 鉴权与权限控制（与项目当前 API 风格一致，本模块不引入）。
- ❌ 前端日志收集与查看（本模块只覆盖后端日志）。
- ❌ 运行时动态调整 `LOG_LEVEL`。
- ❌ 跨多个 Studio 实例的聚合查询。
- ❌ 机器人侧日志的拉取（属于现场诊断模块的范畴）。
- ❌ 解决方案内 `logs/` 命名空间的访问（属于解决方案业务日志的范畴）。

---

## 5. 功能需求

### 5.1 日志文件列表（FR-SL-01）

系统应提供一个接口，列出后端 `logs/` 目录下所有滚动日志文件及其元信息。

每个文件应展示：

| 字段 | 说明 |
|------|------|
| `name` | 文件名（如 `app.1.log`） |
| `size` | 字节大小 |
| `mtime` | 文件最近修改时间（ISO 8601） |
| `firstTs` | 文件内首条日志的时间戳（ISO 8601，可选；解析失败时为空） |
| `lastTs` | 文件内末条日志的时间戳（ISO 8601，可选；解析失败时为空） |
| `isActive` | 是否为当前正在写入的活跃文件 |

`firstTs` / `lastTs` 通过仅读取文件首/末若干字节解析，避免全文件扫描。

### 5.2 时间段日志查询（FR-SL-02）

系统应支持按时间段查询日志条目，并通过分页/虚拟滚动呈现。

**默认行为**：

- 进入页面时默认查询窗口为：`[now - 30min, now]`。
- 默认排序：按时间倒序（最新在上）。

**用户控制**：

- 用户可自定义起止时间，**不设上限**（包括跨多个滚动文件）。
- 用户可切换升序 / 倒序。
- 用户可一键应用快捷时间窗：最近 15 分钟、最近 30 分钟、最近 1 小时、最近 6 小时、最近 24 小时、最近 7 天、自定义。

**单页规模**：

- 单次查询返回上限 `limit ≤ 1000` 条。
- 超出时返回 `nextCursor`，用户滚动或翻页时拉取下一批。
- 响应中 `truncated: boolean` 指示该窗口内是否仍有未返回的条目。

**每条日志展示字段**：

- `time`（带毫秒，本地时区显示，可切换 UTC）
- `level`（带颜色徽标）
- `module`（无 module 字段时显示 `-`）
- `msg`
- 可展开行显示完整 JSON（包含其他结构化字段如 `robotSn`、`taskId`、`durationMs` 等）

### 5.3 筛选（FR-SL-03）

系统应支持以下三种筛选维度，且筛选条件全部下推到后端处理（不在前端做后过滤）：

| 筛选项 | 行为 |
|--------|------|
| **等级多选** | 候选值：trace / debug / info / warn / error / fatal。未选任何项时视为全选。 |
| **模块多选** | 候选值由 `/api/system-logs/modules` 提供，规则：取近期日志中实际出现过的 module 字段去重，并合并静态已知 module 清单（见附录 A）。未选任何项时视为全选。日志条目无 `module` 字段时归入虚拟模块 `(none)`。 |
| **关键字搜索** | 在 `msg` 字段做大小写不敏感子串匹配。空字符串视为不过滤。 |

筛选条件与时间窗组合生效。

### 5.4 时间段打包下载（FR-SL-04）

系统应支持将指定时间窗的日志打包为 zip 下载。

**打包策略**：原始文件打包模式。

- 后端枚举 `logs/` 下所有滚动文件，选出 **任一条目时间戳与请求时间窗有交集** 的文件全集。
- 选中的文件 **原封不动** 放入 zip（不做内容过滤、不重新切分）。
- 同时生成一个 `manifest.json` 放入 zip 根目录。

**`manifest.json` 字段**：

```json
{
  "requestedFrom": "2026-06-07T12:00:00.000Z",
  "requestedTo":   "2026-06-07T13:00:00.000Z",
  "generatedAt":   "2026-06-07T13:00:05.123Z",
  "studioVersion": "0.x.y",
  "files": [
    {
      "name":    "app.2.log",
      "size":    524288000,
      "mtime":   "2026-06-07T12:30:00.000Z",
      "firstTs": "2026-06-07T08:00:00.000Z",
      "lastTs":  "2026-06-07T12:45:00.000Z"
    }
  ]
}
```

**zip 文件命名规范**：

```
robotops-logs-<fromYYYYMMDDHHmmss>-<toYYYYMMDDHHmmss>.zip
```

例：`robotops-logs-20260607120000-20260607130000.zip`。

**响应方式**：流式响应（`Content-Disposition: attachment`），不在内存中组装完整 zip。

**异常处理**：

- 若所选时间窗与所有文件均无交集，返回的 zip 仅包含 `manifest.json`，`files` 数组为空。
- 若 zip 生成过程中出错且 HTTP 已 `200`，通过提前关闭响应流告知前端；前端需将不完整 zip 作为失败处理。

### 5.6 手动刷新（FR-SL-06）

系统应在工具栏提供"Refresh"按钮，用户可以手动触发全量刷新。

**刷新行为**：

- 重新获取日志文件列表（FR-SL-01），以反映滚动产生的新文件。
- 重新获取模块列表（FR-SL-03），以反映新出现的模块名。
- 重新执行当前查询（FR-SL-02），使用当前的筛选条件和时间窗：
  - 若为相对时间窗（如"最近 30 分钟"），重新计算绝对时间戳（`from = now - 30min, to = now`）。
  - 若为自定义绝对时间窗，时间戳保持不变，仅重新拉取该窗口内的最新日志条目。
- 刷新过程中按钮显示 loading 状态并禁用，防止重复点击。
- 刷新不重置当前筛选条件（等级、模块、关键字搜索）。

> **与实时跟随的区别**：手动刷新是一次性 pull 行为，由用户主动触发；实时跟随（tail/follow + SSE push）是持续推送新日志行，列入未来扩展（参见第 12 节）。

### 5.5 单文件直接下载（FR-SL-05）

系统应支持在文件列表（FR-SL-01）中，针对单个日志文件触发原文件下载。

- 触发方式：UI 上文件列表行级"Download"按钮。
- 响应：`application/octet-stream`，`Content-Disposition: attachment; filename="<name>"`。
- 文件名校验：仅允许匹配 `^app\.\d+\.log$`，否则返回 400。
- 与活跃文件的并发：允许下载活跃文件，按下载触发瞬间的文件大小读取（即便后续 Pino 仍在追加，下载内容也只到触发时的长度）。

---

## 6. 数据模型

### 6.1 LogFileInfo

```typescript
interface LogFileInfo {
  name: string;        // 形如 "app.1.log"
  size: number;        // 字节
  mtime: string;       // ISO 8601
  firstTs?: string;    // ISO 8601；解析失败时省略
  lastTs?: string;     // ISO 8601；解析失败时省略
  isActive: boolean;
}
```

### 6.2 LogEntry

```typescript
type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  time: string;                          // ISO 8601
  level: LogLevel;                       // 由 Pino 数值映射
  module?: string;                       // PascalCase；无则省略
  msg: string;
  extra: Record<string, unknown>;        // 原始 JSON 去掉 time/level/module/msg/name/pid/hostname
  raw?: string;                          // 仅当本行解析失败时存在，承载原始文本
}
```

**等级映射**：

| Pino 数值 | LogLevel 字符串 |
|-----------|-----------------|
| 10        | trace           |
| 20        | debug           |
| 30        | info            |
| 40        | warn            |
| 50        | error           |
| 60        | fatal           |
| 其他      | 按最接近的等级归类，且 `extra.levelRaw` 保留原值 |

### 6.3 查询请求与响应

```typescript
interface LogQueryRequest {
  from?: string;       // ISO 8601；缺省由后端使用 now-30min
  to?: string;         // ISO 8601；缺省由后端使用 now
  levels?: LogLevel[]; // 空数组或省略 = 全选
  modules?: string[];  // 空数组或省略 = 全选；"(none)" 匹配无 module 字段的条目
  q?: string;          // msg 子串匹配；省略或空串 = 不过滤
  order?: "asc" | "desc"; // 默认 desc
  limit?: number;      // 默认 500，最大 1000
  cursor?: string;     // 上一次响应的 nextCursor
}

interface LogQueryResponse {
  entries: LogEntry[];
  nextCursor?: string;     // 还有更多时存在
  truncated: boolean;      // limit 达到上限后仍有剩余时为 true
  parseErrorCount: number; // 本次扫描中解析失败的行数
}
```

### 6.4 下载请求

```typescript
interface LogBundleRequest {
  from: string;  // ISO 8601，必填
  to: string;    // ISO 8601，必填
}
```

---

## 7. API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/system-logs/files` | 列出所有日志文件元信息（FR-SL-01） |
| GET  | `/api/system-logs/modules` | 列出可选模块清单，用于筛选下拉（FR-SL-03） |
| GET  | `/api/system-logs/query` | 时间段日志查询（FR-SL-02 / FR-SL-03） |
| POST | `/api/system-logs/download` | 时间段打包下载 zip（FR-SL-04） |
| GET  | `/api/system-logs/files/:name/download` | 单文件原文件下载（FR-SL-05） |

> 路径前缀使用 `/api/system-logs`，避免与未来"机器人日志"或解决方案内 `logs/` 命名空间相关接口混淆。

详细字段、错误码、状态码见《系统日志模块软件设计文档》。

---

## 8. 非功能需求

### 8.1 性能

- 默认窗口（30 分钟）查询应在常规负载下 1 秒内返回首页。
- 跨多个 500MB 滚动文件的查询，采用"反向读取 + 早退出"策略：从最新文件开始反向流式读取，遇到早于 `from` 的条目立即停止。
- 单次查询硬上限 `limit ≤ 1000` 条；超出由 `nextCursor` 继续。
- 下载过程内存占用应稳定，不随时间窗大小线性增长。

### 8.2 可靠性

- 行解析失败不应中断查询：跳过该行并累计到 `parseErrorCount`。
- 文件枚举遇到 `logs/` 目录不存在时，返回空列表而非错误。
- 下载流中途异常应通过关闭流通知客户端，避免产生半截 zip 被误用。

### 8.3 安全性

- 文件名严格白名单：`^app\.\d+\.log$`。
- 禁止任何包含 `..`、绝对路径、URL 编码穿越的输入。
- 不在 API 响应中泄露后端日志目录的绝对路径。

### 8.4 兼容性

- 与现有 Pino 配置（`src/backend/src/logger/index.ts`）100% 兼容。
- 假设日志格式为 JSON Lines（当前生产与文件 sink 均成立）。
- 若用户将 `LOG_LEVEL` 调高导致文件中无 `info` 以下条目，本模块如实反映，不做特殊处理。

### 8.5 易用性

- 进入页面无需任何输入即可看到最近 30 分钟日志。
- 筛选与时间窗变更应自动重新查询，无需点击"应用"按钮。
- 日志条目支持复制（单条 / 多条 / 完整 JSON）。

---

## 9. 与其他模块的关系

| 模块 | 关系 |
|------|------|
| **Solutions / Artifacts** | 同级顶层模块，互不依赖。 |
| **Pino 日志框架** | 单向消费关系：本模块只读 Pino 写出的文件，不修改 Pino 配置。 |
| **现场诊断模块（5.1.6 节）** | 完全独立。诊断模块面向"机器人侧日志"，本模块面向"Studio 后端日志"。 |
| **Solution 内 `logs/` 命名空间** | 完全独立。那是解决方案业务日志的预留命名空间。 |
| **SSE 模块** | 本期不复用 SSE。 |

---

## 10. 关联改动建议（非本模块强制范围）

为使模块筛选（FR-SL-03）能覆盖全部后端模块，建议同步将以下文件改用 `createLogger`：

| 文件 | 当前 | 建议 |
|------|------|------|
| `src/backend/src/services/robotService.ts` | `import { logger }` 直接使用根 logger | `createLogger("RobotService")` |
| `src/backend/src/memStore/memStore.ts` | 同上 | `createLogger("MemStore")` |
| `src/backend/src/memStore/scheduler.ts` | 同上 | `createLogger("MemStoreScheduler")` |

此项作为推荐，不阻塞本模块 MVP 上线。

---

## 11. 验收标准（MVP）

| 编号 | 验收项 |
|------|--------|
| AC-01 | 进入 System Logs 页面默认显示最近 30 分钟的日志条目，倒序排列。 |
| AC-02 | 等级多选、模块多选、关键字搜索三种筛选条件可独立或组合使用。 |
| AC-03 | 用户可自定义任意起止时间，跨多个滚动文件的查询能正确聚合且时间顺序无错乱。 |
| AC-04 | 单次查询返回不超过 1000 条；超出时通过游标可继续拉取。 |
| AC-05 | 文件列表显示所有滚动文件，包括正在写入的活跃文件，标识清晰。 |
| AC-06 | 时间段打包下载得到的 zip 可解压，根目录含 `manifest.json`，原始 `app.<N>.log` 完整无损。 |
| AC-07 | 单文件下载可正确下载指定日志文件原文，文件名校验失败返回 400。 |
| AC-08 | 整个查询/下载过程不影响后端 Pino 日志写入（写入持续不中断、文件未被改动）。 |
| AC-09 | 解析失败的行不阻断查询，`parseErrorCount` 字段如实反映。 |
| AC-10 | 任何包含路径穿越意图的输入均被拒绝并返回 400。 |
| AC-11 | 点击 Refresh 按钮后，文件列表、模块列表和查询结果均刷新为最新数据；relative 时间窗的查询时间戳更新为当前时间；筛选条件不被重置。 |

---

## 12. 未来扩展（非本期）

- 实时跟随（基于 SSE 推送新日志行）。
- 运行时动态调整 `LOG_LEVEL`。
- 按 `category` 引入二级分类（需先在 logger 框架层添加该字段）。
- 多 Studio 实例聚合查询。
- 前端日志收集与查看。
- 全文索引（如 SQLite FTS / loki）以支持更复杂查询。

---

## 附录 A：已知静态模块清单

以下为代码中已使用 `createLogger(...)` 的模块名，供模块筛选下拉初始展示参考（实际下拉以 `/api/system-logs/modules` 返回为准）：

- App
- TaskFlowEngine
- SseManager
- SseRoute
- SshCommand
- SshFileTransfer
- GetRobotBasicInfo
- UpdateRobotBasicInfo
- UpgradeMovebase
- TransferMovebase
- DeleteMovebase
- TransferAlpha2Map
- ApplyAlpha2Map
- DeleteAlpha2Map
- （建议补充）RobotService、MemStore、MemStoreScheduler

虚拟模块 `(none)`：用于匹配无 `module` 字段的日志条目。
