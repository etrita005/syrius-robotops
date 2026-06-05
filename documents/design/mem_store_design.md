# MemStore 模块软件设计文档

## 1. 概述

MemStore 是为 RobotOps Studio 提供的单机内存 KV 缓存模块，面向前端提供对象级读写、按需自动刷新、SSE 实时推送能力。模块严格遵循"零 Redis、零 BullMQ"约束，仅依赖 Hono、lru-cache 与 toad-scheduler 构建。

**核心设计原则**：
- **独立模块**：MemStore 不与任何业务项目耦合，不依赖 TaskFlowEngine 等业务模块
- **非单例**：MemStore 以类形式提供，由调用者决定实例化方式（单例或多实例）
- **事件驱动**：通过 CacheEventHandler 接口解耦数据刷新逻辑，MemStore 仅在缓存事件发生时调用 handler 方法，不自行执行业务数据计算

## 2. 架构设计

```
+-------------------+        +-------------------+
|   Frontend        |<------>|   Hono HTTP API   |
|   (React App)     |  HTTP  |   (index.ts)      |
+-------------------+        +---------+---------+
                                       |
          +----------------------------+-----------------------------+
          |                            |                             |
+---------v---------+      +-----------v-----------+   +-------------v--------+
|  Cache Core       |      |   SseManager          |   |  Scheduler           |
|  (MemStore class) |      |   (shared transport)  |   |  (Scheduler class)   |
|  LRU + Metadata   |      |                       |   |  toad-scheduler      |
|  + Properties     |      |                       |   +----+----------------+
|  + Context        |      |                       |        |
+---------+---------+      +-----------+-----------+        |
          |                            |                     |
          | onCreated/onUpdate/         | onValueChanged/    | cron / timeout
          | onValueChanged/onDeleted    | onDeleted           |
          |                            | (handler broadcasts)|
+---------v---------+                  |                     |
| CacheEventHandler |<-----------------+                     |
| (interface,       |<---------------------------------------+
|  user-provided)   |
+-------------------+
```

## 3. 模块设计

### 3.1 MemStore 类

MemStore 为非单例类，通过构造函数接收 CacheEventHandler 实例：

```typescript
class MemStore {
  constructor(handler: CacheEventHandler)
}
```

调用者负责创建实例并管理其生命周期。在本项目中，后端入口创建一个全局 MemStore 实例并注入到各路由和服务中。

### 3.2 Cache Core (LRU + Metadata + Properties + Context)

核心采用四层结构：

- **LRUCache (`lru-cache`)**：托管热数据（`CacheValuePayload`），按 `max: 1000` 做容量淘汰，按单 Key TTL 做过期淘汰。利用 `dispose` 钩子区分淘汰原因（`evict` / `expire` / `delete` / `set`），实现差异化的资源清理和事件触发。
- **MetaStore (`Map`)**：托管轻量级元数据（Config）。容量淘汰（`evict`）时保留元数据与定时任务，使得被挤出的 Key 仍可通过事件触发自动复活；TTL 过期（`expire`）或显式删除（`delete`）时则彻底清理。
- **Properties (`Map`)**：每个 cache 的只读属性映射。创建时指定，之后不可修改。用于存储与业务相关的元数据（如 solutionId、robotId、taskFlowSpec 等）。
- **Context (`Map`)**：每个 cache 的可读写上下文映射。供 CacheEventHandler 在事件处理过程中注入和传递运行时上下文信息。

**关键字段 `hasValue`**：区分"Key 已创建但尚未获取到有效值"与"Key 存在且值有效"。未携带初始值创建的 Key，`hasValue` 为 `false`，`getCache` 会将其视为 miss 并触发 onUpdate 事件。

### 3.3 Scheduler (toad-scheduler)

封装为 `Scheduler` 类，每个 MemStore 实例持有一个 Scheduler 实例，负责两类定时任务：

- **Cron 周期刷新**：将 Cron 表达式（仅支持 `*/n * * * * *` 秒级简写）解析为秒间隔，映射为 `SimpleIntervalJob`。
- **预到期预警**：使用原生 `setTimeout` 实现一次性预警。

提供 `clearJobsForKey` 方法，在 Key 删除、配置变更、LRU 过期时统一停止相关任务。

### 3.4 SSE 推送管理

MemStore 自身不包含 SSE 逻辑，SSE 由调用者通过 `CacheEventHandler` 的 `onValueChanged` 和 `onDeleted` 方法实现。

SSE 推送统一由 `SseManager`（`src/backend/src/services/sseManager.ts`）负责，详见 `documents/design/sse-manager.md`。原 `MemStoreSseManager` 辅助类已废弃。

核心机制：
- 调用者构造的 `CacheEventHandler` 实现持有 `SseManager` 实例引用。
- 调用者在 `onValueChanged` 中调用 `sseManager.broadcast("memstore/entry-updated", { key, value, properties })`。
- 调用者在 `onDeleted` 中调用 `sseManager.broadcast("memstore/entry-deleted", { key })`。
- 如需在客户端连接时推送当前缓存初始状态，调用者的 handler 应同时实现 `ISseManagerEventHandler.onClientConnected`，在其中遍历 `memStore.listCaches()` 并调用 `sseManager.sendToClient(clientId, "memstore/entry-current", ...)`。
- 前端通过统一端点 `GET /api/sse` 订阅所有事件，按事件名命名空间区分模块。

### 3.5 事件接口 (CacheEventHandler)

MemStore 通过 `CacheEventHandler` 接口与业务逻辑解耦。接口定义：

```typescript
interface CacheEntry {
  key: string;
  value: unknown;
  hasValue: boolean;
  properties: Readonly<Record<string, unknown>>;
  context: Record<string, unknown>;
  config: CacheConfig;
  createdAt: number;
  updatedAt: number;
  expireAt: number;
}

interface CacheEventHandler {
  onCreated(entry: CacheEntry): void;
  onUpdate(entry: CacheEntry): void;
  onValueChanged(entry: CacheEntry): void;
  onDeleted(entry: CacheEntry): void;
}
```

**事件触发时机**：
- **onCreated**：调用 `createCache` 创建缓存条目时触发。在本项目中，handler 从 `entry.properties.taskFlowSpec` 获取任务流规格并启动首次数据获取。
- **onUpdate**：以下场景触发：
  - 缓存未命中（miss）
  - 预到期预警
  - Cron 周期定时刷新
  - 外部手动触发刷新（`triggerRefresh`）
  
  在本项目中，handler 从 `entry.properties.taskFlowSpec` 获取任务流规格并通过 TaskFlowEngine 执行数据获取，获取完成后调用 `memStore.updateCache(key, value)` 写回数据。

- **onValueChanged**：调用 `updateCache` 写回数据时触发。在本项目中，handler 在此方法中调用 `sseManager.broadcast(key, { key, value, type: 'update' })` 实现 SSE 广播。

- **onDeleted**：以下场景触发：
  - 显式删除（`deleteCache`）
  - TTL 过期（`expire`）
  
  在本项目中，handler 在此方法中调用 `sseManager.broadcast(key, { key, type: 'deleted' })` 实现 SSE 广播，并可执行清理操作（如终止正在执行的任务流）。

**updateCache 不触发 onUpdate**：当 handler 调用 `updateCache(key, value)` 写回数据时，不触发 `onUpdate`（避免递归），而是触发 `onValueChanged`（供调用者执行 SSE 广播等副作用）。

### 3.6 属性过滤查询

MemStore 提供 `listCaches(filter?)` 方法，支持按属性 map 过滤缓存条目：

- 不传过滤条件时，返回所有 cache 的摘要列表
- 传入属性 map 时，遍历所有 cache，对每个 cache 的 properties 逐一比对过滤 map 中的每个键值对，仅返回完全匹配的 cache 列表

## 4. 数据模型

### 4.1 CacheValuePayload（LRU 存储）

| 字段 | 类型 | 说明 |
|------|------|------|
| value | unknown | 缓存值 |
| hasValue | boolean | 是否已取得有效值 |
| createdAt | number | 创建时间戳 |
| updatedAt | number | 更新时间戳 |
| expireAt | number | 逻辑过期时间戳 |

### 4.2 CacheConfig（Meta 存储）

| 字段 | 类型 | 说明 |
|------|------|------|
| ttlMs | number | 存活时长（毫秒） |
| cron | string? | 周期刷新规则（秒级简化 Cron） |
| preExpireWarningMs | number? | 提前预警时长（毫秒） |

### 4.3 CacheEntry（事件参数与查询返回）

| 字段 | 类型 | 说明 |
|------|------|------|
| key | string | 缓存键 |
| value | unknown | 缓存值 |
| hasValue | boolean | 是否已取得有效值 |
| properties | Readonly\<Record\<string, unknown\>\> | 只读属性映射 |
| context | Record\<string, unknown\> | 可读写上下文映射 |
| config | CacheConfig | 缓存配置 |
| createdAt | number | 创建时间戳 |
| updatedAt | number | 更新时间戳 |
| expireAt | number | 逻辑过期时间戳 |

### 4.4 CacheEventHandler（事件接口）

| 方法 | 参数 | 说明 |
|------|------|------|
| onCreated | entry: CacheEntry | 缓存创建时触发 |
| onUpdate | entry: CacheEntry | 缓存需要刷新时触发 |
| onValueChanged | entry: CacheEntry | 缓存值被 updateCache 更新时触发 |
| onDeleted | entry: CacheEntry | 缓存删除或过期时触发 |

## 5. 接口定义

### 5.1 接口对照表（HTTP 接口 ↔ 函数接口）

| # | HTTP 方法 | HTTP 路径 | 函数接口 | 说明 |
|---|-----------|-----------|----------|------|
| 1 | POST | `/api/memstore/cache` | `createCache(key, config, options?)` | 创建缓存条目 |
| 2 | GET | `/api/memstore/cache` | `getCache(key)` | 获取缓存值及属性 |
| 3 | GET | `/api/memstore/cache/detail` | `getCacheDetail(key)` | 获取缓存值、属性及上下文 |
| 4 | GET | `/api/memstore/cache/exists` | `hasCache(key)` | 检查缓存是否存在且有效 |
| 5 | GET | `/api/memstore/cache/meta` | `getCacheMeta(key)` | 获取缓存元数据 |
| 6 | POST | `/api/memstore/internal/cache` | `updateCache(key, value)` | 内部更新缓存值（handler 回写） |
| 7 | DELETE | `/api/memstore/cache` | `deleteCache(key)` | 删除缓存 |
| 8 | DELETE | `/api/memstore/cache/prefix` | `deleteByPrefix(prefix)` | 按前缀批量删除缓存 |
| 9 | PUT | `/api/memstore/cache/config` | `updateConfig(key, partial)` | 动态修改配置 |
| 10 | POST | `/api/memstore/cache/refresh` | `triggerRefresh(key)` | 手动触发刷新 |
| 11 | POST | `/api/memstore/caches/query` | `listCaches(filter?)` | 列出/过滤缓存 |
| 12 | GET | `/api/sse` | 统一 SSE 长连接端点 | 由 `SseManager` 管理，详见 `documents/design/sse-manager.md` |

### 5.2 HTTP 接口详细定义

#### POST `/api/memstore/cache` — 创建缓存

请求体：
```json
{
  "key": "robot:sol1/robot-abc",
  "config": { "ttlMs": 300000, "cron": "*/180" },
  "initialValue": null,
  "properties": { "solutionId": "sol1", "robotId": "robot-abc", "taskFlowSpec": { ... } }
}
```

响应：`{ "success": true, "key": "..." }`

#### GET `/api/memstore/cache?key=` — 获取缓存值及属性

响应：
```json
{ "key": "...", "value": { ... }, "properties": { ... } }
```
未找到或无有效值时返回 404。

#### GET `/api/memstore/cache/detail?key=` — 获取缓存详情（含上下文）

响应：
```json
{ "key": "...", "value": { ... }, "properties": { ... }, "context": { ... } }
```

#### GET `/api/memstore/cache/exists?key=` — 检查缓存是否存在

响应：`{ "key": "...", "exists": true }`

#### GET `/api/memstore/cache/meta?key=` — 获取缓存元数据

响应：
```json
{ "key": "...", "config": { ... }, "payload": { ... } }
```

#### POST `/api/memstore/internal/cache?key=` — 内部更新缓存值

请求体：`{ "value": { ... } }`

响应：`{ "success": true, "key": "..." }`

#### DELETE `/api/memstore/cache?key=` — 删除缓存

响应：`{ "success": true, "key": "..." }`

#### DELETE `/api/memstore/cache/prefix?prefix=` — 按前缀删除

响应：`{ "deletedKeys": ["..."] }`

#### PUT `/api/memstore/cache/config?key=` — 更新配置

请求体：`{ "ttlMs": 600000, "cron": "*/300" }`

响应：`{ "success": true, "key": "..." }`

#### POST `/api/memstore/cache/refresh?key=` — 触发刷新

响应：`{ "success": true, "key": "..." }`

#### POST `/api/memstore/caches/query` — 列出/过滤缓存

请求体：`{ "properties": { "solutionId": "sol1" } }`

响应：
```json
{
  "caches": [
    { "key": "...", "value": { ... }, "hasValue": true, "properties": { ... }, "config": { ... }, "createdAt": 0, "updatedAt": 0, "expireAt": 0 }
  ]
}
```

#### GET `/api/sse` — 统一 SSE 订阅端点

MemStore 相关事件由 `SseManager` 通过统一端点广播（详见 `documents/design/sse-manager.md`）。事件命名空间：

- `memstore/entry-current`：客户端连接时，对每个已有值的缓存项推送一次（由 `RobotCacheEventHandler.onClientConnected` 发送）
- `memstore/entry-updated`：缓存值被更新时广播
- `memstore/entry-deleted`：缓存被删除时广播

事件统一信封格式：
```
event: memstore/entry-updated
data: {"event":"memstore/entry-updated","payload":{"key":"...","value":{...},"properties":{...}},"timestamp":"..."}
```

### 5.3 函数接口详细定义

```typescript
class MemStore {
  constructor(handler: CacheEventHandler)

  createCache(key: string, config: CacheConfig, options?: {
    initialValue?: unknown;
    properties?: Record<string, unknown>;
  }): void

  getCache(key: string): unknown | undefined

  getCacheDetail(key: string): CacheEntry | undefined

  hasCache(key: string): boolean

  getCacheMeta(key: string): { config: CacheConfig; payload?: CacheValuePayload; properties: Readonly<Record<string, unknown>> } | undefined

  updateCache(key: string, value: unknown): void

  deleteCache(key: string): void

  deleteByPrefix(prefix: string): string[]

  updateConfig(key: string, partial: Partial<CacheConfig>): void

  triggerRefresh(key: string): void

  listCaches(filter?: Record<string, unknown>): CacheEntry[]
}

// SSE 推送由 SseManager 提供，参见 documents/design/sse-manager.md
// MemStore 不再提供独立的 SSE 辅助类（原 MemStoreSseManager 已废弃）
```

## 6. 关键逻辑

### 6.1 刷新防抖（Refresh Debounce）

MemStore 维护 `refreshing: Set<string>`。
- 当多路径（miss、预到期、Cron、手动）并发请求同一 Key 刷新时，仅调用一次 handler.onUpdate；后续请求跳过。
- handler 完成数据获取并调用 updateCache 后（或 handler 自行决定结束时），从 Set 中移除，允许下一次刷新正常触发。

### 6.2 缓存未命中触发刷新

`getCache` 逻辑：
1. 若 LRU 中存在且 `hasValue === true`，直接返回值。
2. 若 LRU 中不存在，或存在但 `hasValue === false`，检查 `metaStore`。
3. 若 `metaStore` 存在，构建 CacheEntry 并调用 `handler.onUpdate(entry)`，当前请求返回 `undefined`（上层返回 404）。
4. handler 异步获取数据后调用 `updateCache` 更新数据，`updateCache` 触发 `onValueChanged` 供 handler 实现 SSE 广播。

### 6.3 预到期预警（Pre-Expire Warning）

创建或更新缓存时，`setupSchedule` 计算：
```
warningDelay = expireAt - now - preExpireWarningMs
```
- 若 `warningDelay > 0`，通过 `setTimeout` 注册一次性预警任务，到期时调用 `handler.onUpdate(entry)`。
- 若 `warningDelay <= 0`，立即调用 `handler.onUpdate(entry)`。

### 6.4 Cron 周期定时刷新

- Cron 配置变更或缓存更新时，先 `clearJobsForKey` 清理旧周期任务，再注册新的 `SimpleIntervalJob`。
- 每次周期到达，调用 `handler.onUpdate(entry)`；若该 Key 正在刷新中，防抖机制保证不会重复调用。

### 6.5 事件触发流程

**创建缓存（createCache）**：
1. 写入 LRU + metaStore + properties + context
2. 设置定时任务
3. 调用 `handler.onCreated(entry)`

**触发刷新（triggerRefresh / miss / warning / cron）**：
1. 检查防抖（refreshing Set）
2. 加入 refreshing Set
3. 构建 CacheEntry
4. 调用 `handler.onUpdate(entry)`
5. handler 负责异步获取数据并调用 `updateCache(key, value)` 写回
6. `updateCache` 更新值、重置 TTL、重新设置定时任务
7. `updateCache` 调用 `handler.onValueChanged(entry)`，由 handler 实现 SSE 广播

**删除缓存（deleteCache / TTL 过期）**：
1. 从 LRU 移除（触发 dispose 钩子）
2. 清理 metaStore + properties + context
3. 清理定时任务
4. 调用 `handler.onDeleted(entry)`，由 handler 实现 SSE 广播

### 6.6 资源清理

**显式删除 (`deleteCache`)**：
- 从 LRU 中移除（触发 `dispose`）。
- 从 `metaStore`、`propertiesStore`、`contextStore` 中移除。
- 调用 `clearJobsForKey` 停止所有定时任务。
- 调用 `handler.onDeleted(entry)`，由 handler 实现 SSE 广播。

**LRU 容量淘汰 (`evict`)**：
- `dispose` 钩子识别 `reason === 'evict'`。
- 仅打印日志，保留 `metaStore`、`propertiesStore`、`contextStore` 与定时任务，以便后续自动刷新将数据重新载入缓存。
- 不触发 `handler.onDeleted`（数据未消亡，仅被暂时淘汰）。

**LRU TTL 过期 (`expire`)**：
- `dispose` 钩子识别 `reason === 'expire'`。
- 构建缓存条目快照，调用 `handler.onDeleted(entry)`。
- 彻底清理 `metaStore`、`propertiesStore`、`contextStore` 与定时任务。

### 6.7 属性过滤查询

`listCaches(filter?)` 实现：
1. 遍历 `metaStore` 中所有 key
2. 对每个 key，构建 CacheEntry
3. 若提供了 filter，检查该 cache 的 properties 是否包含 filter 中的所有键值对
4. 仅返回完全匹配的 CacheEntry 列表
5. 若未提供 filter，返回所有 cache 列表

## 7. 测试

详见 `documents/test/mem_store_test_cases.md`。

测试执行方式：
```bash
cd src/backend
npm install
npx vitest run --reporter=verbose
```

## 8. 约束与注意事项

1. **单机架构**：当前为单进程内存实现，不支持多实例共享缓存。
2. **Cron 简化**：Cron 仅支持 `*/n * * * * *` 秒级简写，生产环境可扩展为完整 Cron 解析器。
3. **事件驱动**：MemStore 不包含任何业务逻辑，所有数据刷新通过 CacheEventHandler 事件接口交由调用者实现。
4. **容量淘汰与内存**：`metaStore`、`propertiesStore`、`contextStore` 在容量淘汰时保留，若 Key 数量极大可能带来轻量级元数据内存增长，生产环境可引入上限控制或外部持久化。
5. **SSE 断线重连**：前端测试示例包含基础 SSE 连接管理，生产环境建议增加指数退避重连与连接池心跳超时清理。
6. **Properties 只读**：属性 map 在 cache 创建后不可修改，确保数据一致性。
7. **Context 可变**：上下文 map 在运行过程中可读写，供 handler 传递状态，但需注意并发安全。
