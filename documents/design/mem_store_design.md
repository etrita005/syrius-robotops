# MemStore 模块软件设计文档

## 1. 概述

MemStore 是为 RobotOps Studio 提供的单机内存 KV 缓存服务，面向前端提供对象级读写、按需自动刷新、SSE 实时推送能力。模块严格遵循“零 Redis、零 BullMQ”约束，仅依赖 Hono、lru-cache 与 toad-scheduler 构建，全部数据刷新逻辑交由外部自研任务流引擎执行，本模块仅承担调度、缓存管理、推送与指令下发的职责。

## 2. 架构设计

```
+-------------------+        +-------------------+
|   Pure HTML Test  |<------>|   Hono HTTP API   |
|   (Frontend)      |  HTTP  |   (server.ts)     |
+-------------------+        +---------+---------+
                                       |
          +----------------------------+--------------------+
          |                            |                    |
+---------v---------+      +-----------v-----------+  +----v---------------+
|  Cache Core       |      |   SSE Push Manager    |  |  Scheduler         |
|  (memStore.ts)    |      |   (server.ts /       |  |  (scheduler.ts)    |
|  LRU + Metadata   |      |    memStore.ts)       |  |  toad-scheduler    |
+---------+---------+      +-----------+-----------+  +----+---------------+
          |                            |                    |
          |  miss / warning / cron     |  update callback   |  cron / timeout
+---------v---------+                  |                    |
|  Task Engine      |                  |                    |
|  Adapter          |                  |                    |
|  (taskEngine.ts)  |                  |                    |
+-------------------+                  |                    |
                                       |                    |
+-------------------+                  |                    |
|  Self-Developed   |<-----------------+                    |
|  Task Flow Engine |<--------------------------------------+
+-------------------+
```

## 3. 模块设计

### 3.1 HTTP API Layer (Hono)

基于 Hono 构建，提供以下职责：
- CORS 中间件，支持纯 HTML 前端跨域访问。
- RESTful 路由：前端读写、元数据查询、配置修改、手动强制刷新。
- 内部路由：`/api/internal/cache/:key` 供任务流引擎回调写入更新。
- SSE 端点：`/api/sse/:key`，基于 Hono `streamSSE` 实现长连接推送。
- 静态页面托管：根路径 `/` 返回 `public/index.html` 测试客户端。

### 3.2 Cache Core (LRU + Metadata)

核心实现位于 `memStore.ts`，采用双层结构：

- **LRUCache (`lru-cache`)**：托管热数据（`CacheValuePayload`），按 `max: 1000` 做容量淘汰，按单 Key TTL 做过期淘汰。利用 `dispose` 钩子区分淘汰原因（`evict` / `expire` / `delete` / `set`），实现差异化的资源清理。
- **MetaStore (`Map`)**：托管轻量级元数据（DAG、Config）。容量淘汰（`evict`）时保留元数据与定时任务，使得被挤出的 Key 仍可通过“miss 触发刷新”或 Cron 任务自动复活；TTL 过期（`expire`）或显式删除（`delete`）时则彻底清理。

**关键字段 `hasValue`**：区分“Key 已创建但尚未获取到有效值”与“Key 存在且值有效”。未携带初始值创建的 Key，`hasValue` 为 `false`，`getCache` 会将其视为 miss 并触发异步刷新。

### 3.3 Scheduler (toad-scheduler)

封装在 `scheduler.ts`，负责两类定时任务：

- **Cron 周期刷新**：将 Cron 表达式（Playground 中仅支持 `*/n * * * * *` 秒级简写）解析为秒间隔，映射为 `SimpleIntervalJob`。
- **预到期预警**：使用原生 `setTimeout` 实现一次性预警（toad-scheduler 主要面向周期任务，一次性任务由 `setTimeout` 承载，生命周期由模块统一管理）。

提供 `clearJobsForKey` 接口，在 Key 删除、配置变更、LRU 过期时统一停止相关任务，杜绝僵尸任务。

### 3.4 SSE Push Manager

基于 Hono `streamSSE` 实现，核心机制：
- 每个前端订阅对应一个 `ReadableStream` 连接。
- `memStore.subscribe(key, callback)` 注册推送回调；当缓存更新时，`broadcast` 遍历该 Key 的所有存活连接，通过 `stream.writeSSE` 下发 JSON。
- 订阅建立时，若当前 Key 已有有效值，立即推送 `type: 'current'` 事件，保证前端首屏数据一致性。
- 连接存活期间每 5 秒发送 `ping` 事件，便于前端检测断线并重连。

### 3.5 Task Engine Adapter

封装在 `taskEngine.ts`，当前为 Mock 实现：
- 接收前端传入的 DAG（JSON 描述）。
- Playground 中仅支持 `type: 'mock'`，可按 `delayMs` 模拟执行耗时，返回固定 `returnValue`。
- 生产环境中，此模块应替换为向自研任务流引擎提交 DAG 并监听回调的适配层。

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

### 4.3 Dag（Meta 存储）

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | DAG 类型标识 |
| returnValue | unknown | Mock 模式下的返回值 |
| delayMs | number? | Mock 执行延迟 |

## 5. 接口定义

### 5.1 前端接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/cache` | 新建缓存 Key，可携带初始值与 DAG |
| GET | `/api/cache/:key` | 查询缓存值（miss 时异步触发刷新并返回 404） |
| DELETE | `/api/cache/:key` | 删除缓存及相关资源 |
| POST | `/api/cache/:key/refresh` | 手动强制刷新 |
| PUT | `/api/cache/:key/config` | 动态修改 TTL、Cron、预警配置 |
| GET | `/api/cache/:key/meta` | 查询缓存元数据与当前 Payload |

### 5.2 内部接口（任务引擎回调）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/internal/cache/:key` | 引擎完成任务后回写最新数据 |

### 5.3 SSE 订阅接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sse/:key` | 按 Key 维度建立 SSE 长连接，接收更新事件 |

**SSE 事件格式示例**：
```
data: {"key":"k1","value":{"step":2},"type":"update"}

event: ping
data: {"type":"ping"}
```

## 6. 关键逻辑

### 6.1 刷新防抖（Refresh Debounce）

`memStore.ts` 维护 `refreshing: Map<string, Promise<unknown>>`。
- 当多路径（miss、预到期、Cron、手动）并发请求同一 Key 刷新时，仅向引擎提交一次任务；后续请求复用同一 Promise。
- 任务完成后（无论成功或失败），从 Map 中移除，允许下一次刷新正常触发。

### 6.2 缓存未命中触发刷新

`getCache` 逻辑：
1. 若 LRU 中存在且 `hasValue === true`，直接返回值。
2. 若 LRU 中不存在，或存在但 `hasValue === false`，检查 `metaStore`。
3. 若 `metaStore` 存在，异步调用 `triggerRefresh`，当前请求返回 `undefined`（上层返回 404）。
4. 刷新完成后，`updateCache` 更新数据并广播 SSE，前端通过 SSE 或下次轮询获取新值。

### 6.3 预到期预警（Pre-Expire Warning）

创建或更新缓存时，`setupSchedule` 计算：
```
warningDelay = expireAt - now - preExpireWarningMs
```
- 若 `warningDelay > 0`，通过 `setTimeout` 注册一次性预警任务。
- 若 `warningDelay <= 0`，立即触发刷新。
- 刷新成功后，`expireAt` 重置，重新计算并注册新的预警任务。

### 6.4 Cron 周期定时刷新

- Cron 配置变更或缓存更新时，先 `clearJobsForKey` 清理旧周期任务，再注册新的 `SimpleIntervalJob`。
- 每次周期到达，调用 `triggerRefresh`；若该 Key 正在刷新中，防抖机制保证不会重复提交。

### 6.5 资源清理

**显式删除 (`deleteCache`)**：
- 从 LRU 中移除（触发 `dispose`）。
- 从 `metaStore` 中移除。
- 调用 `clearJobsForKey` 停止所有定时任务。
- 广播 `type: 'deleted'` SSE 事件。

**LRU 容量淘汰 (`evict`)**：
- `dispose` 钩子识别 `reason === 'evict'`。
- 仅打印日志，保留 `metaStore` 与定时任务，以便后续自动刷新将数据重新载入缓存。

**LRU TTL 过期 (`expire`)**：
- `dispose` 钩子识别 `reason === 'expire'`。
- 彻底清理 `metaStore` 与定时任务，等同于数据消亡。

## 7. 测试

本项目在 `playground/mem_store/public/index.html` 中提供了纯 HTML 前端测试客户端，覆盖以下场景：

1. **基础 CRUD**：创建（含初始值）、读取、内部更新、删除、404 验证。
2. **Miss 触发刷新**：创建无初始值但带 DAG 的 Key，首次 GET 返回 404 并自动触发刷新，轮询验证缓存最终被填充。
3. **SSE 实时推送**：订阅 SSE 后，通过内部接口更新数据，验证前端收到 `type: 'update'` 事件。
4. **元数据与动态配置**：查询 Meta，修改 TTL 后再次查询验证变更生效。
5. **手动强制刷新**：对空 Key 执行 Force Refresh，验证直接返回引擎计算的新值。

测试执行方式：
```bash
cd playground/mem_store
npm install
npm run dev        # 启动服务
npx tsx e2e-test.ts # 自动化端到端测试（Playwright 驱动纯 HTML 页面）
```

## 8. 约束与注意事项

1. **单机架构**：当前为单进程内存实现，不支持多实例共享缓存。
2. **Cron 简化**：Playground 中 Cron 仅支持 `*/n * * * * *` 秒级简写，生产环境可扩展为完整 Cron 解析器。
3. **任务引擎 Mock**：`taskEngine.ts` 为本地模拟，生产环境需替换为真实的自研任务流引擎 RPC/HTTP 适配层。
4. **容量淘汰与内存**：`metaStore` 在容量淘汰时保留，若 Key 数量极大可能带来轻量级元数据内存增长，生产环境可引入上限控制或外部持久化。
5. **SSE 断线重连**：前端测试示例包含基础 SSE 连接管理，生产环境建议增加指数退避重连与连接池心跳超时清理。
