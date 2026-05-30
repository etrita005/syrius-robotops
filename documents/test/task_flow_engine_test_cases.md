# 任务流引擎服务 — 测试用例设计文档

> 本文档依据《任务流引擎服务需求规格说明书》和《任务流引擎服务软件设计文档》编写，覆盖所有功能需求（FR-TFE-001 至 FR-TFE-023）、API 规格和错误处理场景。

---

## 1. 测试策略

### 1.1 测试范围

- **单元测试**：TaskFlowEngine 核心类方法（createFlow、pauseFlow、resumeFlow、stopFlow、deleteFlow、getFlow、listFlows、batch 操作、loadPersistedFlows、destroy）
- **集成测试**：REST API 路由层测试（通过 Hono 的 `app.request()` 进行 HTTP 级别测试）
- **事件测试**：SSE 事件推送验证（通过 SseManager 广播验证）
- **状态机测试**：任务流和子任务状态转换验证
- **错误处理测试**：各类异常场景覆盖

### 1.2 测试框架

使用 Node.js 内置的 `node:test` + `node:assert`，无需额外测试框架依赖。测试入口为 `src/backend/src/test.ts`。

### 1.3 Mock 策略

- `ObjectStore`：使用内存实现，支持 putJson、getJson、list、deletePath
- `SseManager`：记录 broadcast 调用的事件和数据，支持断言验证
- `ResolverRegistry`：注册 Mock 解析器（MockTask1、MockTask2），模拟业务逻辑
- `flowed`：使用真实的 `flowed` 库（项目已有依赖）

---

## 2. 测试用例

### TC-TFE-001：创建并启动内部任务流（FR-TFE-001）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 createFlow 能正确创建 `internal` 类型任务流，状态转为 RUNNING |
| **前置条件** | 引擎初始化完成，ResolverRegistry 注册了 MockTask1 |
| **输入** | `type: "internal"`, DAG 包含 1 个任务（MockTask1） |
| **预期结果** | 返回 FlowSummary，`state === "RUNNING"`，`taskStates` 中任务状态为 PENDING |
| **验证点** | flowId 为 UUID 格式，type 为 internal，taskStates 包含所有任务 |

### TC-TFE-002：创建并启动用户任务流（FR-TFE-001）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 createFlow 能正确创建 `user` 类型任务流并持久化 |
| **前置条件** | 引擎初始化完成，ObjectStore 可用 |
| **输入** | `type: "user"`, DAG 包含 1 个任务（MockTask1） |
| **预期结果** | 返回 FlowSummary，`state === "RUNNING"`；ObjectStore 中持久化了流记录 |
| **验证点** | 通过 ObjectStore.getJson 能获取到流记录 |

### TC-TFE-003：创建流时传递流级别输入参数（FR-TFE-002）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 createFlow 的 input 参数被正确存储和传递 |
| **前置条件** | 引擎初始化完成 |
| **输入** | `type: "internal"`, `input: { robotIp: "10.0.0.1" }`, DAG 包含 1 个任务 |
| **预期结果** | FlowSummary 中 `input === { robotIp: "10.0.0.1" }` |
| **验证点** | input 被存储在 FlowRecord 中并出现在 FlowSummary 中 |

### TC-TFE-004：创建流时未提供 input 参数（FR-TFE-002）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 input 参数可选，默认行为正确 |
| **前置条件** | 引擎初始化完成 |
| **输入** | `type: "internal"`, 不传 input，DAG 包含 1 个任务 |
| **预期结果** | FlowSummary 中 `input` 为 undefined |
| **验证点** | 不传 input 时引擎正常工作 |

### TC-TFE-005：子任务参数映射 — 数据槽引用（FR-TFE-003）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 resolver.params 的数据槽引用模式 |
| **前置条件** | 引擎初始化完成 |
| **输入** | DAG 中任务 resolver.params 使用字符串值（如 `"robotIp"`）引用数据槽 |
| **预期结果** | 流执行过程中，解析器接收到的参数来自数据槽 |
| **验证点** | MockTask 接收到正确的参数值 |

### TC-TFE-006：子任务参数映射 — 静态值（FR-TFE-003）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 resolver.params 的静态值模式 |
| **前置条件** | 引擎初始化完成 |
| **输入** | DAG 中任务 resolver.params 使用 `{ value: ... }` 格式传递静态值 |
| **预期结果** | 解析器接收到静态值作为参数 |
| **验证点** | MockTask 接收到 value 指定的参数值 |

### TC-TFE-007：子任务间数据传递（FR-TFE-004）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证上游任务产出数据槽，下游任务等待依赖满足后才执行 |
| **前置条件** | 引擎初始化完成，注册两个 MockTask |
| **输入** | DAG: task1 提供 `data1`，task2 requires `data1` |
| **预期结果** | task1 先于 task2 完成，task2 接收到 task1 的输出 |
| **验证点** | task2 在 task1 完成后才执行，task2 的 params 包含 task1 的产出 |

### TC-TFE-008：流级别输出参数（FR-TFE-005）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 expectedResults 指定的数据槽在流完成后被提取到 results |
| **前置条件** | 引擎初始化完成 |
| **输入** | `expectedResults: ["data1"]`, DAG 中 task1 provides `data1` |
| **预期结果** | 流完成后 FlowSummary 中 `results` 包含 `data1` |
| **验证点** | results 对象存在且包含 expectedResults 中的键 |

### TC-TFE-009：列举所有任务流（FR-TFE-006）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 listFlows 返回所有任务流，按 createdAt 降序排列 |
| **前置条件** | 已创建 3 个任务流 |
| **输入** | 不传 filterType |
| **预期结果** | 返回长度为 3 的数组，按创建时间降序 |
| **验证点** | 数组长度和排序正确 |

### TC-TFE-010：按类型过滤列举任务流（FR-TFE-006）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 listFlows 按类型过滤 |
| **前置条件** | 已创建 1 个 internal 流和 1 个 user 流 |
| **输入** | `filterType: "internal"` |
| **预期结果** | 仅返回 internal 类型的流 |
| **验证点** | 返回的数组中所有元素的 type 为 internal |

### TC-TFE-011：查询单个任务流详情（FR-TFE-007）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 getFlow 返回完整 FlowSummary |
| **前置条件** | 已创建任务流 |
| **输入** | 有效的 flowId |
| **预期结果** | 返回 FlowSummary，包含 taskStates、taskResults、input 等字段 |
| **验证点** | 返回对象的 id 匹配请求的 id |

### TC-TFE-012：查询不存在的任务流（FR-TFE-007）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 getFlow 对不存在的流返回 undefined |
| **前置条件** | 引擎中无该流 |
| **输入** | 不存在的 flowId |
| **预期结果** | 返回 undefined |
| **验证点** | getFlow 返回 undefined |

### TC-TFE-013：暂停正在运行的任务流（FR-TFE-008）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 pauseFlow 将 RUNNING 流转为 PAUSED |
| **前置条件** | 已创建处于 RUNNING 状态的任务流 |
| **输入** | 有效的 flowId |
| **预期结果** | 流状态变为 PAUSED，SSE 广播 flow-updated 事件 |
| **验证点** | state === "PAUSED" |

### TC-TFE-014：暂停非 RUNNING 状态的任务流（幂等）（FR-TFE-008）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 pauseFlow 对非 RUNNING 状态的流静默忽略 |
| **前置条件** | 流处于 PENDING 或 COMPLETED 状态 |
| **输入** | 有效的 flowId（非 RUNNING 状态） |
| **预期结果** | 无错误抛出，流状态不变 |
| **验证点** | 无异常抛出 |

### TC-TFE-015：恢复已暂停的任务流（FR-TFE-009）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 resumeFlow 将 PAUSED 流转为 RUNNING |
| **前置条件** | 已创建并暂停任务流 |
| **输入** | 有效的 flowId |
| **预期结果** | 流状态变为 RUNNING |
| **验证点** | state === "RUNNING" |

### TC-TFE-016：恢复非 PAUSED 状态的任务流（幂等）（FR-TFE-009）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 resumeFlow 对非 PAUSED 状态的流静默忽略 |
| **前置条件** | 流处于 RUNNING 或 COMPLETED 状态 |
| **输入** | 有效的 flowId（非 PAUSED 状态） |
| **预期结果** | 无错误抛出，流状态不变 |
| **验证点** | 无异常抛出 |

### TC-TFE-017：停止任务流（FR-TFE-010）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 stopFlow 将 RUNNING 流转为 STOPPED |
| **前置条件** | 已创建处于 RUNNING 状态的任务流 |
| **输入** | 有效的 flowId |
| **预期结果** | 流状态变为 STOPPED，未执行子任务变为 SKIPPED，finishedAt 已设置 |
| **验证点** | state === "STOPPED"，finishedAt 非空 |

### TC-TFE-018：停止已处于终态的任务流（幂等）（FR-TFE-010）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 stopFlow 对终态流静默忽略 |
| **前置条件** | 流处于 COMPLETED/FAILED/STOPPED 状态 |
| **输入** | 有效的 flowId（终态） |
| **预期结果** | 无错误抛出 |
| **验证点** | 无异常抛出 |

### TC-TFE-019：删除任务流记录（FR-TFE-011）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 deleteFlow 正确移除终态流 |
| **前置条件** | 已创建处于 COMPLETED 状态的 user 流 |
| **输入** | 有效的 flowId |
| **预期结果** | 内存中流记录被移除，ObjectStore 中数据被删除，SSE 广播 flow-removed 事件 |
| **验证点** | getFlow 返回 undefined，ObjectStore 中不存在该流 |

### TC-TFE-020：删除 RUNNING 流（自动停止后删除）（FR-TFE-011）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 deleteFlow 对运行中的流先自动停止再删除 |
| **前置条件** | 已创建处于 RUNNING 状态的 user 流 |
| **输入** | 有效的 flowId |
| **预期结果** | 流先被停止，再被删除 |
| **验证点** | getFlow 返回 undefined |

### TC-TFE-021：批量暂停（FR-TFE-012）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 batchPause 批量操作 |
| **前置条件** | 已创建 2 个 RUNNING 流 |
| **输入** | `ids: [flowId1, flowId2]` |
| **预期结果** | 两个流状态均为 PAUSED |
| **验证点** | 两个流 state === "PAUSED" |

### TC-TFE-022：批量恢复（FR-TFE-012）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 batchResume 批量操作 |
| **前置条件** | 已创建 2 个 PAUSED 流 |
| **输入** | `ids: [flowId1, flowId2]` |
| **预期结果** | 两个流状态均为 RUNNING |
| **验证点** | 两个流 state === "RUNNING" |

### TC-TFE-023：批量停止（FR-TFE-012）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 batchStop 批量操作 |
| **前置条件** | 已创建 2 个 RUNNING 流 |
| **输入** | `ids: [flowId1, flowId2]` |
| **预期结果** | 两个流状态均为 STOPPED |
| **验证点** | 两个流 state === "STOPPED" |

### TC-TFE-024：批量删除（FR-TFE-012）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 batchDelete 批量操作 |
| **前置条件** | 已创建 2 个 COMPLETED 流 |
| **输入** | `ids: [flowId1, flowId2]` |
| **预期结果** | 两个流均被删除 |
| **验证点** | getFlow 对两个 id 均返回 undefined |

### TC-TFE-025：批量操作中部分失败不影响其他（FR-TFE-012）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证批量操作中单个失败不影响其他操作 |
| **前置条件** | 已创建 1 个流 + 1 个不存在的 flowId |
| **输入** | `ids: [validFlowId, nonExistentFlowId]` |
| **预期结果** | 有效流操作成功，无效流被忽略，无异常抛出 |
| **验证点** | 有效流状态正确变更 |

### TC-TFE-026：SSE 事件 — flow-created（FR-TFE-013, FR-TFE-014）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证创建流时广播 flow-created 事件 |
| **前置条件** | 引擎初始化完成 |
| **输入** | 创建任务流 |
| **预期结果** | SseManager 广播了 `task-flow-engine/flow-created` 事件 |
| **验证点** | 事件名和数据中包含 flowId、type、state、timestamp |

### TC-TFE-027：SSE 事件 — flow-updated（FR-TFE-013, FR-TFE-014）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证流状态变更时广播 flow-updated 事件 |
| **前置条件** | 已创建任务流 |
| **输入** | 暂停流 / 恢复流 / 停止流 |
| **预期结果** | SseManager 广播了 `task-flow-engine/flow-updated` 事件 |
| **验证点** | 事件名正确，数据中包含更新后的状态 |

### TC-TFE-028：SSE 事件 — task-updated（FR-TFE-013, FR-TFE-014）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证子任务状态变更时广播 task-updated 事件 |
| **前置条件** | 已创建包含 1 个任务的任务流 |
| **输入** | 等待任务开始执行 |
| **预期结果** | SseManager 广播了 `task-flow-engine/task-updated` 事件 |
| **验证点** | 事件数据包含 flowId、taskName、state |

### TC-TFE-029：SSE 事件 — task-result（FR-TFE-014, FR-TFE-015）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证子任务完成时广播 task-result 事件并携带结果 |
| **前置条件** | 已创建包含 1 个任务的任务流 |
| **输入** | 等待任务完成 |
| **预期结果** | SseManager 广播了 `task-flow-engine/task-result` 事件 |
| **验证点** | 事件数据包含 flowId、taskName、state: "COMPLETED"、result |

### TC-TFE-030：SSE 事件 — flow-completed（FR-TFE-014, FR-TFE-016）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证流进入终态时广播 flow-completed 事件 |
| **前置条件** | 已创建包含 1 个任务的任务流 |
| **输入** | 等待流完成 |
| **预期结果** | SseManager 广播了 `task-flow-engine/flow-completed` 事件 |
| **验证点** | 事件数据包含 flowId、state、results、finishedAt、timestamp |

### TC-TFE-031：SSE 事件 — flow-removed（FR-TFE-014, FR-TFE-011）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证删除流时广播 flow-removed 事件 |
| **前置条件** | 已创建 COMPLETED 流 |
| **输入** | 删除流 |
| **预期结果** | SseManager 广播了 `task-flow-engine/flow-removed` 事件 |
| **验证点** | 事件数据包含 flowId、timestamp |

### TC-TFE-032：子任务结果提取（FR-TFE-015）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证子任务完成时 taskResults 被正确提取 |
| **前置条件** | 已创建任务流，任务 provides `data1` |
| **输入** | 等待任务完成 |
| **预期结果** | FlowRecord.taskResults 中包含该任务的结果 |
| **验证点** | taskResults 对象存在且包含任务代码对应的结果 |

### TC-TFE-033：流完成结果提取（FR-TFE-016）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证流完成时 expectedResults 被正确提取到 results |
| **前置条件** | 已创建任务流，expectedResults: ["data1"] |
| **输入** | 等待流完成 |
| **预期结果** | FlowRecord.results 中包含 data1 |
| **验证点** | results.data1 存在且值正确 |

### TC-TFE-034：用户流持久化（FR-TFE-017）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 user 流在状态变更时被持久化到 ObjectStore |
| **前置条件** | 引擎初始化完成，ObjectStore 可用 |
| **输入** | 创建 user 类型任务流 |
| **预期结果** | ObjectStore 中 `flows/{flowId}` 存在且内容为 FlowRecord JSON |
| **验证点** | getJson 返回的对象 id、type、dag 匹配 |

### TC-TFE-035：内部流不持久化（FR-TFE-017）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 internal 流不被持久化 |
| **前置条件** | 引擎初始化完成，ObjectStore 可用 |
| **输入** | 创建 internal 类型任务流 |
| **预期结果** | ObjectStore 中不存在 `flows/{flowId}` |
| **验证点** | ObjectStore 中没有对应的文件 |

### TC-TFE-036：重启恢复 — RUNNING 流自动重启（FR-TFE-018）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证后端重启后 RUNNING 状态的持久化流自动恢复执行 |
| **前置条件** | ObjectStore 中存在一个 state: "RUNNING" 的 FlowRecord |
| **输入** | 创建新引擎实例并调用 loadPersistedFlows |
| **预期结果** | 流被加载并自动重新开始执行 |
| **验证点** | 引擎 flows 中包含该流，流状态恢复为 RUNNING |

### TC-TFE-037：重启恢复 — PAUSED 流保持暂停（FR-TFE-018）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证后端重启后 PAUSED 状态的持久化流保持暂停 |
| **前置条件** | ObjectStore 中存在一个 state: "PAUSED" 的 FlowRecord |
| **输入** | 创建新引擎实例并调用 loadPersistedFlows |
| **预期结果** | 流被加载，状态保持 PAUSED，不自动执行 |
| **验证点** | 引擎 flows 中包含该流，state === "PAUSED" |

### TC-TFE-038：重启恢复 — 终态流仅加载为历史记录（FR-TFE-018）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证后端重启后终态持久化流被加载但不重新执行 |
| **前置条件** | ObjectStore 中存在一个 state: "COMPLETED" 的 FlowRecord |
| **输入** | 创建新引擎实例并调用 loadPersistedFlows |
| **预期结果** | 流被加载到内存，状态保持 COMPLETED |
| **验证点** | getFlow 返回 COMPLETED 状态的流 |

### TC-TFE-039：TTL 自动清理（FR-TFE-019）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证已结束流在 TTL 到期后被自动清理 |
| **前置条件** | 引擎以极短 TTL（如 100ms）初始化，已创建 COMPLETED 流 |
| **输入** | 等待 TTL 清理周期 |
| **预期结果** | 流被从内存中移除，SSE 广播 flow-removed 事件 |
| **验证点** | getFlow 返回 undefined |

### TC-TFE-040：TTL 不清理未结束的流（FR-TFE-019）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 TTL 清理不删除非终态的流 |
| **前置条件** | 引擎以极短 TTL 初始化，已创建 RUNNING 流 |
| **输入** | 等待 TTL 清理周期 |
| **预期结果** | RUNNING 流仍存在于内存中 |
| **验证点** | getFlow 返回非 undefined |

### TC-TFE-041：解析器注册与查找（FR-TFE-021）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 ResolverRegistry 的 register/get/has/getAll 方法 |
| **前置条件** | ResolverRegistry 实例 |
| **输入** | 注册一个解析器，然后查询 |
| **预期结果** | get 返回注册的类，has 返回 true，getAll 包含注册项 |
| **验证点** | 所有查询方法返回正确结果 |

### TC-TFE-042：创建流时校验解析器是否注册（FR-TFE-022）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证引用未注册解析器时创建流抛出错误 |
| **前置条件** | 引擎初始化，ResolverRegistry 中无该解析器 |
| **输入** | DAG 引用未注册的解析器名称 |
| **预期结果** | createFlow 抛出包含 "not registered" 的错误 |
| **验证点** | 异常被抛出 |

### TC-TFE-043：引擎 destroy 方法（FR-TFE-023）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 destroy() 停止 TTL 清理定时器 |
| **前置条件** | 引擎已初始化（cleanupTimer 正在运行） |
| **输入** | 调用 engine.destroy() |
| **预期结果** | cleanupTimer 被清除，不再触发清理 |
| **验证点** | 可以通过多次调用 destroy 验证幂等性 |

---

## 3. API 路由测试

### TC-API-001：POST /api/flows — 创建流成功

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 POST /api/flows 正常创建流 |
| **输入** | `{ type: "internal", dag: { tasks: { task1: { resolver: { name: "MockTask1" } } } } }` |
| **预期结果** | HTTP 201，响应体为 FlowSummary JSON |
| **验证点** | 状态码 201，响应体包含 id、type、state |

### TC-API-002：POST /api/flows — 缺少 type 或 dag

| 项 | 值 |
|----|-----|
| **测试目标** | 验证缺少必填字段时返回 400 |
| **输入** | `{ type: "internal" }`（无 dag） |
| **预期结果** | HTTP 400，error: "MISSING_TYPE_OR_DAG" |
| **验证点** | 状态码 400 |

### TC-API-003：POST /api/flows — 无效 type

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 type 非法时返回 400 |
| **输入** | `{ type: "invalid", dag: { tasks: {} } }` |
| **预期结果** | HTTP 400，error: "INVALID_TYPE" |
| **验证点** | 状态码 400 |

### TC-API-004：GET /api/flows — 列举流

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 GET /api/flows 返回流列表 |
| **前置条件** | 已创建 2 个流 |
| **输入** | GET 请求 |
| **预期结果** | HTTP 200，返回 FlowSummary[] |
| **验证点** | 数组长度 2 |

### TC-API-005：GET /api/flows?type=internal — 过滤列举

| 项 | 值 |
|----|-----|
| **测试目标** | 验证按类型过滤 |
| **输入** | GET /api/flows?type=internal |
| **预期结果** | 仅返回 internal 类型的流 |
| **验证点** | 所有元素的 type 为 internal |

### TC-API-006：GET /api/flows/:id — 查询详情

| 项 | 值 |
|----|-----|
| **测试目标** | 验证查询单个流详情 |
| **输入** | 有效 flowId |
| **预期结果** | HTTP 200，返回完整 FlowSummary |
| **验证点** | 状态码 200，id 匹配 |

### TC-API-007：GET /api/flows/:id — 流不存在

| 项 | 值 |
|----|-----|
| **测试目标** | 验证查询不存在的流返回 404 |
| **输入** | 无效 flowId |
| **预期结果** | HTTP 404，error: "FLOW_NOT_FOUND" |
| **验证点** | 状态码 404 |

### TC-API-008：POST /api/flows/:id/pause — 暂停成功

| 项 | 值 |
|----|-----|
| **测试目标** | 验证暂停 API |
| **输入** | 有效 flowId |
| **预期结果** | HTTP 200，{ success: true } |
| **验证点** | 状态码 200 |

### TC-API-009：POST /api/flows/:id/pause — 流不存在

| 项 | 值 |
|----|-----|
| **测试目标** | 验证暂停不存在的流返回 404 |
| **输入** | 无效 flowId |
| **预期结果** | HTTP 404 |
| **验证点** | 状态码 404 |

### TC-API-010：POST /api/flows/:id/resume — 恢复成功

| 项 | 值 |
|----|-----|
| **测试目标** | 验证恢复 API |
| **输入** | 有效 flowId（PAUSED 状态） |
| **预期结果** | HTTP 200，{ success: true } |
| **验证点** | 状态码 200 |

### TC-API-011：POST /api/flows/:id/stop — 停止成功

| 项 | 值 |
|----|-----|
| **测试目标** | 验证停止 API |
| **输入** | 有效 flowId（RUNNING 状态） |
| **预期结果** | HTTP 200，{ success: true } |
| **验证点** | 状态码 200 |

### TC-API-012：DELETE /api/flows/:id — 删除成功

| 项 | 值 |
|----|-----|
| **测试目标** | 验证删除 API |
| **输入** | 有效 flowId（COMPLETED 状态） |
| **预期结果** | HTTP 200，{ success: true } |
| **验证点** | 状态码 200 |

### TC-API-013：POST /api/flows/batch/pause — 批量暂停

| 项 | 值 |
|----|-----|
| **测试目标** | 验证批量暂停 API |
| **输入** | `{ ids: [flowId1, flowId2] }` |
| **预期结果** | HTTP 200，{ success: true } |
| **验证点** | 状态码 200 |

### TC-API-014：POST /api/flows/batch/pause — ids 不是数组

| 项 | 值 |
|----|-----|
| **测试目标** | 验证批量操作参数校验 |
| **输入** | `{ ids: "not-an-array" }` |
| **预期结果** | HTTP 400，error: "INVALID_IDS" |
| **验证点** | 状态码 400 |

### TC-API-015：GET /api/flows/events — SSE 连接

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 SSE 端点返回 text/event-stream |
| **前置条件** | 引擎初始化完成 |
| **输入** | GET /api/flows/events |
| **预期结果** | HTTP 200，Content-Type: text/event-stream，body 包含 connected 事件 |
| **验证点** | 响应头和初始 connected 事件 |

---

## 4. 状态机测试

### TC-SM-001：流状态转换 — PENDING → RUNNING

| 项 | 值 |
|----|-----|
| **测试目标** | 验证流从 PENDING 转为 RUNNING |
| **前置条件** | 刚创建但尚未 start 的流 |
| **输入** | startFlow |
| **预期结果** | state === "RUNNING" |
| **验证点** | 状态转换正确 |

### TC-SM-002：流状态转换 — RUNNING → COMPLETED

| 项 | 值 |
|----|-----|
| **测试目标** | 验证所有任务成功完成时流转为 COMPLETED |
| **前置条件** | RUNNING 状态的流 |
| **输入** | 所有任务正常完成 |
| **预期结果** | state === "COMPLETED"，finishedAt 已设置 |
| **验证点** | 终态正确 |

### TC-SM-003：流状态转换 — RUNNING → FAILED

| 项 | 值 |
|----|-----|
| **测试目标** | 验证任务失败时流转为 FAILED |
| **前置条件** | RUNNING 状态的流 |
| **输入** | 某任务抛出错误 |
| **预期结果** | state === "FAILED"，未执行子任务 SKIPPED |
| **验证点** | 失败状态和 SKIPPED 标记正确 |

### TC-SM-004：流状态转换 — RUNNING → PAUSED → RUNNING

| 项 | 值 |
|----|-----|
| **测试目标** | 验证暂停和恢复的完整循环 |
| **前置条件** | RUNNING 状态的流 |
| **输入** | pauseFlow 后 resumeFlow |
| **预期结果** | 最终 state === "RUNNING"（或 COMPLETED） |
| **验证点** | 中间状态 PAUSED，恢复后继续执行 |

### TC-SM-005：流状态转换 — RUNNING → STOPPED

| 项 | 值 |
|----|-----|
| **测试目标** | 验证停止运行中的流 |
| **前置条件** | RUNNING 状态的流 |
| **输入** | stopFlow |
| **预期结果** | state === "STOPPED"，finishedAt 已设置 |
| **验证点** | 停止状态正确 |

### TC-SM-006：子任务状态转换 — PENDING → RUNNING → COMPLETED

| 项 | 值 |
|----|-----|
| **测试目标** | 验证子任务完整的生命周期 |
| **前置条件** | 流中包含一个任务 |
| **输入** | 等待任务执行完成 |
| **预期结果** | taskStates 中该任务最终为 COMPLETED |
| **验证点** | 经历了 PENDING → RUNNING → COMPLETED |

### TC-SM-007：子任务状态 — SKIPPED

| 项 | 值 |
|----|-----|
| **测试目标** | 验证流失败/停止时未执行任务标记为 SKIPPED |
| **前置条件** | 流包含 2 个任务，task1 失败，task2 依赖 task1 |
| **输入** | 等待流结束 |
| **预期结果** | task2 状态为 SKIPPED |
| **验证点** | task2 的 taskState === "SKIPPED" |

---

## 5. 错误处理测试

### TC-ERR-001：操作不存在的流（pauseFlow）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 pauseFlow 对不存在的流抛出 "Flow not found" |
| **输入** | 不存在的 flowId |
| **预期结果** | 抛出 Error("Flow not found") |
| **验证点** | 异常消息为 "Flow not found" |

### TC-ERR-002：操作不存在的流（resumeFlow）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 resumeFlow 对不存在的流抛出错误 |
| **输入** | 不存在的 flowId |
| **预期结果** | 抛出 Error("Flow not found") |
| **验证点** | 异常消息为 "Flow not found" |

### TC-ERR-003：操作不存在的流（stopFlow）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 stopFlow 对不存在的流抛出错误 |
| **输入** | 不存在的 flowId |
| **预期结果** | 抛出 Error("Flow not found") |
| **验证点** | 异常消息为 "Flow not found" |

### TC-ERR-004：操作不存在的流（deleteFlow）

| 项 | 值 |
|----|-----|
| **测试目标** | 验证 deleteFlow 对不存在的流抛出错误 |
| **输入** | 不存在的 flowId |
| **预期结果** | 抛出 Error("Flow not found") |
| **验证点** | 异常消息为 "Flow not found" |

### TC-ERR-005：对象存储写入失败不阻塞主流程

| 项 | 值 |
|----|-----|
| **测试目标** | 验证持久化失败时引擎继续正常运行 |
| **前置条件** | 使用会抛出错误的 mock ObjectStore |
| **输入** | 创建 user 流 |
| **预期结果** | 流正常创建和执行，不因持久化失败而崩溃 |
| **验证点** | 无未捕获异常 |

---

## 6. 测试覆盖率目标

| 覆盖类型 | 目标 |
|---------|------|
| 函数覆盖率 | ≥ 90% |
| 分支覆盖率 | ≥ 85% |
| 行覆盖率 | ≥ 90% |

| 模块 | 目标覆盖率 |
|------|-----------|
| taskFlowEngine.ts | 100% 函数覆盖 |
| resolverRegistry.ts | 100% 函数覆盖 |
| sseManager.ts | 100% 函数覆盖 |
| taskFlowRoutes.ts | ≥ 80% 路由覆盖 |

---

## 7. 测试数据说明

### 7.1 Mock 解析器

```typescript
class MockTask1 implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    return { done: true, result: "mock1-result", value: params.value ?? "default" };
  }
}

class MockTask2 implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    return { done: true, result: "mock2-result", value: params.value ?? "default" };
  }
}

class MockFailingTask implements ITaskResolver {
  async exec(_params: ValueMap): Promise<ValueMap> {
    throw new Error("Simulated task failure");
  }
}
```

### 7.2 测试 DAG 模板

```typescript
// 单任务 DAG
const singleTaskDag: FlowSpec = {
  tasks: {
    task1: {
      provides: ["data1"],
      resolver: { name: "MockTask1" }
    }
  }
};

// 双任务 DAG（有依赖关系）
const dependentDag: FlowSpec = {
  tasks: {
    task1: {
      provides: ["data1"],
      resolver: { name: "MockTask1", results: { done: "data1" } }
    },
    task2: {
      requires: ["data1"],
      provides: ["data2"],
      resolver: { name: "MockTask2", results: { done: "data2" } }
    }
  }
};
```
