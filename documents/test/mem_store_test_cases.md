# MemStore 模块测试用例文档

## 一、测试范围

覆盖 MemStore 类的核心功能：缓存 CRUD、属性与上下文、事件接口、刷新机制、SSE 推送、属性过滤查询、配置管理、资源清理。

## 二、测试用例

### TC-MS-001: 创建缓存（无初始值、无属性）

- **前置条件**: MemStore 实例已创建
- **操作**: `createCache("k1", { ttlMs: 60000 })`
- **预期结果**:
  - `hasCache("k1")` 返回 `false`（无有效值）
  - `getCache("k1")` 返回 `undefined`
  - `handler.onCreated` 被调用一次，参数 entry.key === "k1"，entry.hasValue === false
  - `getCacheMeta("k1")` 返回含 config 的元数据

### TC-MS-002: 创建缓存（含初始值和属性）

- **前置条件**: MemStore 实例已创建
- **操作**: `createCache("k2", { ttlMs: 60000 }, { initialValue: { a: 1 }, properties: { solutionId: "sol1", robotId: "r1" } })`
- **预期结果**:
  - `hasCache("k2")` 返回 `true`
  - `getCache("k2")` 返回 `{ a: 1 }`
  - `handler.onCreated` 被调用，entry.value 深度等于 `{ a: 1 }`，entry.properties 深度等于 `{ solutionId: "sol1", robotId: "r1" }`
  - `getCacheDetail("k2")` 返回含 value 和 properties 的详情

### TC-MS-003: 获取缓存值和属性

- **前置条件**: 已创建含属性的缓存
- **操作**: `getCacheDetail("k2")`
- **预期结果**: 返回 CacheEntry，value 和 properties 均正确

### TC-MS-004: 属性 map 创建后只读

- **前置条件**: 已创建含属性的缓存
- **操作**: 尝试修改返回的 properties 对象
- **预期结果**: 修改不影响 MemStore 内部存储的 properties（因为 properties 使用深拷贝或 Object.freeze）

### TC-MS-005: 上下文 map 运行时可读写

- **前置条件**: 已创建缓存
- **操作**:
  1. `getCacheDetail("k1")` 获取 entry
  2. `entry.context.lastFlowId = "flow-123"`
  3. 再次 `getCacheDetail("k1")`
- **预期结果**: 第二次获取的 context 包含 `lastFlowId: "flow-123"`

### TC-MS-006: 缓存未命中触发 onUpdate

- **前置条件**: 已创建无初始值的缓存
- **操作**: `getCache("k1")`
- **预期结果**:
  - 返回 `undefined`
  - `handler.onUpdate` 被调用，entry.key === "k1"
  - handler 可从 entry.properties 获取 taskFlowSpec

### TC-MS-007: 手动触发刷新

- **前置条件**: 已创建缓存
- **操作**: `triggerRefresh("k1")`
- **预期结果**:
  - `handler.onUpdate` 被调用，entry.key === "k1"
  - handler 调用 `updateCache("k1", newValue)` 后，`getCache("k1")` 返回新值

### TC-MS-008: updateCache 触发 onValueChanged，不触发 onUpdate

- **前置条件**: 已创建缓存
- **操作**:
  1. 记录 handler 调用次数
  2. `updateCache("k1", { updated: true })`
- **预期结果**:
  - `getCache("k1")` 返回 `{ updated: true }`
  - handler.onCreated / onUpdate / onDeleted 均未被调用
  - handler.onValueChanged 被调用，entry.key === "k1"，entry.value 深度等于 `{ updated: true }`

### TC-MS-009: 删除缓存触发 onDeleted

- **前置条件**: 已创建缓存
- **操作**: `deleteCache("k1")`
- **预期结果**:
  - `hasCache("k1")` 返回 `false`
  - `getCacheMeta("k1")` 返回 `undefined`
  - `handler.onDeleted` 被调用，entry.key === "k1"
  - handler 的 onDeleted 实现中调用 `sseManager.broadcast` 发送 `type: 'deleted'` 事件

### TC-MS-010: 按前缀批量删除缓存

- **前置条件**: 已创建 `robot:sol1/r1`、`robot:sol1/r2`、`robot:sol2/r3`
- **操作**: `deleteByPrefix("robot:sol1/")`
- **预期结果**:
  - 返回 `["robot:sol1/r1", "robot:sol1/r2"]`
  - `hasCache("robot:sol1/r1")` 和 `hasCache("robot:sol1/r2")` 均为 false
  - `hasCache("robot:sol2/r3")` 仍为 true
  - handler.onDeleted 被调用 2 次

### TC-MS-011: 属性过滤查询

- **前置条件**: 已创建多个缓存：
  - `k1` properties: `{ solutionId: "sol1", robotId: "r1" }`
  - `k2` properties: `{ solutionId: "sol1", robotId: "r2" }`
  - `k3` properties: `{ solutionId: "sol2", robotId: "r3" }`
- **操作与预期**:
  - `listCaches({ solutionId: "sol1" })` 返回 k1、k2
  - `listCaches({ solutionId: "sol1", robotId: "r1" })` 仅返回 k1
  - `listCaches()` 返回 k1、k2、k3
  - `listCaches({ solutionId: "sol3" })` 返回空列表

### TC-MS-012: 刷新防抖

- **前置条件**: 已创建缓存
- **操作**: 连续调用 `triggerRefresh("k1")` 3 次
- **预期结果**: `handler.onUpdate` 仅被调用 1 次

### TC-MS-013: 配置动态修改

- **前置条件**: 已创建缓存，config 为 `{ ttlMs: 60000 }`
- **操作**: `updateConfig("k1", { ttlMs: 120000, cron: "*/60" })`
- **预期结果**: `getCacheMeta("k1")` 的 config 显示 ttlMs=120000, cron="*/60"

### TC-MS-014: SSE 订阅通过 MemStoreSseManager 接收更新事件

- **前置条件**: 已创建缓存，handler 的 onValueChanged 调用 `sseManager.broadcast`
- **操作**:
  1. `sseManager.subscribe("k1", callback, memStore)` 注册订阅
  2. `updateCache("k1", newValue)`
- **预期结果**: callback 收到 `type: 'update'` 事件，包含 key 和 value

### TC-MS-015: SSE 订阅通过 MemStoreSseManager 立即推送当前值

- **前置条件**: 已创建含有效值的缓存
- **操作**: `sseManager.subscribe("k1", callback, memStore)` 注册订阅
- **预期结果**: callback 立即收到 `type: 'current'` 事件

### TC-MS-016: Cron 周期触发 onUpdate

- **前置条件**: 创建缓存 config `{ ttlMs: 300000, cron: "*/2" }`（2秒周期）
- **操作**: 等待 3 秒
- **预期结果**: `handler.onUpdate` 至少被调用 1 次

### TC-MS-017: 预到期预警触发 onUpdate

- **前置条件**: 创建缓存 config `{ ttlMs: 10000, preExpireWarningMs: 5000 }`
- **操作**: 等待 6 秒
- **预期结果**: `handler.onUpdate` 被调用（预到期触发）

### TC-MS-018: TTL 过期触发 onDeleted

- **前置条件**: 创建缓存 config `{ ttlMs: 1000 }`
- **操作**: 等待 1.5 秒后调用 `hasCache`
- **预期结果**:
  - `hasCache` 返回 false
  - `handler.onDeleted` 被调用

### TC-MS-019: LRU 容量淘汰不触发 onDeleted

- **前置条件**: 创建 max=2 的 MemStore，已创建 2 个缓存
- **操作**: 创建第 3 个缓存，触发 LRU 淘汰
- **预期结果**: handler.onDeleted 未被调用（仅 evict，非数据消亡）

### TC-MS-020: handler 通过 context 注入上下文

- **前置条件**: 已创建缓存，handler 实现在 onUpdate 中向 entry.context 写入数据
- **操作**:
  1. handler.onUpdate 中设置 `entry.context.flowId = "flow-abc"`
  2. 后续事件中读取 `entry.context.flowId`
- **预期结果**: context 中的 flowId 在后续事件中可读取

### TC-MS-021: HTTP 接口 — POST /cache 创建缓存

- **前置条件**: 后端服务运行
- **操作**: `POST /api/memstore/cache` body `{ key, config, properties }`
- **预期结果**: 返回 `{ success: true, key }`，后续 GET 能获取到

### TC-MS-022: HTTP 接口 — GET /cache 获取缓存值和属性

- **前置条件**: 已通过 HTTP 创建含属性的缓存
- **操作**: `GET /api/memstore/cache?key=k1`
- **预期结果**: 返回 `{ key, value, properties }`

### TC-MS-023: HTTP 接口 — GET /cache/detail 获取详情

- **前置条件**: 已创建缓存
- **操作**: `GET /api/memstore/cache/detail?key=k1`
- **预期结果**: 返回 `{ key, value, properties, context }`

### TC-MS-024: HTTP 接口 — POST /caches/query 过滤查询

- **前置条件**: 已创建多个含属性的缓存
- **操作**: `POST /api/memstore/caches/query` body `{ properties: { solutionId: "sol1" } }`
- **预期结果**: 返回匹配的缓存列表

### TC-MS-025: HTTP 接口 — POST /cache/refresh 触发刷新

- **前置条件**: 已创建缓存
- **操作**: `POST /api/memstore/cache/refresh?key=k1`
- **预期结果**: 返回 `{ success: true, key }`，handler.onUpdate 被调用

### TC-MS-026: HTTP 接口 — DELETE /cache 删除缓存

- **前置条件**: 已创建缓存
- **操作**: `DELETE /api/memstore/cache?key=k1`
- **预期结果**: 返回 `{ success: true, key }`，handler.onDeleted 被调用

### TC-MS-027: HTTP 接口 — DELETE /cache/prefix 按前缀删除

- **前置条件**: 已创建多个缓存
- **操作**: `DELETE /api/memstore/cache/prefix?prefix=robot:sol1/`
- **预期结果**: 返回 `{ deletedKeys: [...] }`

### TC-MS-028: HTTP 接口 — PUT /cache/config 更新配置

- **前置条件**: 已创建缓存
- **操作**: `PUT /api/memstore/cache/config?key=k1` body `{ ttlMs: 120000 }`
- **预期结果**: 返回 `{ success: true, key }`，元数据中 config 已更新

### TC-MS-029: HTTP 接口 — POST /internal/cache 内部更新

- **前置条件**: 已创建缓存
- **操作**: `POST /api/memstore/internal/cache?key=k1` body `{ value: { updated: true } }`
- **预期结果**: 返回 `{ success: true, key }`，GET 获取到新值

### TC-MS-030: HTTP 接口 — GET /cache/exists 检查存在

- **前置条件**: 已创建缓存
- **操作**: `GET /api/memstore/cache/exists?key=k1`
- **预期结果**: 返回 `{ key: "k1", exists: true/false }`

### TC-MS-031: 多 MemStore 实例互不干扰

- **前置条件**: 创建两个 MemStore 实例，各自有独立的 handler
- **操作**: 在 store1 创建缓存，在 store2 查询
- **预期结果**: store2 查询不到 store1 的缓存，两个实例完全隔离

### TC-MS-032: 不传 handler 时使用空实现

- **前置条件**: 未提供 CacheEventHandler
- **操作**: 创建 MemStore 时不传 handler
- **预期结果**: 使用默认空实现（no-op），不报错

## 三、集成测试用例

### TC-INT-001: RobotService 创建机器人时创建缓存并触发 onCreated

- **操作**: `robotService.create(solutionId, { address: "192.168.1.100:22" })`
- **预期结果**:
  - memStore 中存在对应 key 的缓存
  - handler.onCreated 被调用
  - entry.properties 包含 solutionId、robotId、taskFlowSpec

### TC-INT-002: handler.onCreated 调用 TaskFlowEngine 获取数据

- **操作**: 创建机器人后等待
- **预期结果**:
  - TaskFlowEngine 被调用
  - 缓存值被更新
  - SSE 推送 update 事件

### TC-INT-003: 删除机器人时触发 onDeleted

- **操作**: `robotService.remove(solutionId, robotId)`
- **预期结果**:
  - 缓存被删除
  - handler.onDeleted 被调用

### TC-INT-004: removeSolutionCache 批量删除

- **操作**: `robotService.removeSolutionCache(solutionId)`
- **预期结果**: 该方案下所有机器人缓存被删除

### TC-INT-005: 属性过滤查询机器人缓存

- **操作**: `listCaches({ solutionId: "sol1" })`
- **预期结果**: 返回 sol1 下所有机器人缓存条目
