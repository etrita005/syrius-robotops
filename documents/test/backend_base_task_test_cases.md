# 后端任务基类（BaseTask） — 测试用例设计文档

> 本文档依据《后端任务基类（BaseTask）需求规格说明书》与《后端任务基类（BaseTask）软件设计文档》编写，覆盖 FR-BT-001 至 FR-BT-015 全部功能需求与 NFR-BT-001 至 NFR-BT-005 关键非功能需求。

---

## 1. 测试策略

### 1.1 测试范围

| 范围 | 说明 |
|------|------|
| **单元测试** | BaseTask 自身行为：生命周期编排、ignoreFailure 转义、日志注入、context / task 参数处理。 |
| **集成测试** | TaskFlowEngine 注入 `flowId` / `flowPhase` 到 context 的端到端验证（启动一个 BaseTask 派生任务，断言 context 字段）。 |
| **回归测试** | 现有 `src/backend/src/test.ts` 中所有任务流引擎与子任务用例在 BaseTask 引入后全部通过。 |

### 1.2 测试范围外

- 各具体 real / mock 任务的业务逻辑测试（其原有测试保持不变，不在本文档范围）。
- 二级基类 `SshCommandTask` / `SshFileTransferTask` 的重试逻辑细节（重试不下沉到 BaseTask，本次不重做相关用例）。

### 1.3 测试框架

- Node.js 内置 `node:test` + `node:assert`。
- 测试文件：在 `src/backend/src/test.ts` 中新增 `### BaseTask` 测试小节；如该文件已过大，可拆出 `src/backend/src/tests/baseTask.test.ts`，但在本设计中仍按"`test.ts` 中追加 section"为基线。

### 1.4 Mock 策略

- 不引入新的测试依赖。
- 通过定义本地 `class TestableTask extends BaseTask { ... }` 提供可控的 `onInitialize` / `onExec` / `onDestroy` 行为。
- 对 `this.log` 的断言：通过临时调用 `configureLogger()` 切到一个写入内存的 transport，或通过劫持 `rootLogger.child` 的返回值（推荐前者，与现有日志测试模式一致）。
- 对 `flowed` Task 类型的模拟：构造一个最小对象 `{ code: "<taskCode>" }` 作为 `task` 参数即可（生产代码仅访问 `task.code`）。

---

## 2. 测试用例

### 2.1 生命周期编排

#### TC-BT-001：onInitialize 返回 true → onExec 与 onDestroy 都被调用（FR-BT-002, FR-BT-003）

| 项 | 值 |
|----|-----|
| **测试目标** | 默认成功路径下，三个生命周期方法按 init → exec → destroy 顺序调用各 1 次。 |
| **前置条件** | 派生 `TestableTask` 重写三方法，记录调用顺序 `calls: string[]`。 |
| **输入** | `exec({}, { flowId: "f1" })` |
| **预期结果** | `calls === ["init", "exec", "destroy"]`，`exec` 返回 `{}`。 |
| **验证点** | 顺序正确，3 个方法各被调用 1 次。 |

#### TC-BT-002：onInitialize 返回 false → onExec 不被调用，onDestroy 被调用（FR-BT-003, FR-BT-005）

| 项 | 值 |
|----|-----|
| **测试目标** | `onInitialize` 返回 `false` 时跳过 `onExec`。 |
| **前置条件** | `onInitialize` 返回 `false`，`onExec` 不应被调用，`onDestroy` 应被调用。 |
| **输入** | `exec({}, { flowId: "f1" })` |
| **预期结果** | 调用顺序 `["init", "destroy"]`；`exec` 抛 `Error('onInitialize returned false')`。 |
| **验证点** | `onExec` 未被调用；`onDestroy` 被调用；抛出的 Error.message 等于固定文案。 |

#### TC-BT-003：onInitialize 抛异常 → onExec 不被调用，onDestroy 被调用（FR-BT-003, FR-BT-005）

| 项 | 值 |
|----|-----|
| **测试目标** | `onInitialize` 抛异常路径与返回 `false` 等价，但保留原异常对象。 |
| **输入** | `onInitialize` 抛 `new Error("init boom")`。 |
| **预期结果** | 调用顺序 `["init", "destroy"]`；`exec` 抛出原异常（message 为 `"init boom"`）。 |
| **验证点** | `onExec` 未被调用；`onDestroy` 被调用；抛出异常对象与原始一致（不是 wrap）。 |

#### TC-BT-004：onExec 抛异常 → onDestroy 仍被调用（FR-BT-003, FR-BT-005）

| 项 | 值 |
|----|-----|
| **测试目标** | `onExec` 抛异常时 `onDestroy` 仍被调用。 |
| **输入** | `onExec` 抛 `new Error("exec boom")`。 |
| **预期结果** | 调用顺序 `["init", "exec", "destroy"]`；`exec` 抛出原异常。 |
| **验证点** | `onDestroy` 被调用；原异常对象被透传。 |

#### TC-BT-005：异步生命周期方法被正确等待（FR-BT-002, NFR-BT-002）

| 项 | 值 |
|----|-----|
| **测试目标** | 三个钩子返回 Promise 时，BaseTask 都应 await。 |
| **输入** | 三个钩子均使用 `await new Promise(r => setTimeout(r, 10))`，并在 resolve 后 `push` 调用记录。 |
| **预期结果** | 调用记录顺序仍为 `["init", "exec", "destroy"]`，`exec` 返回成功。 |
| **验证点** | 不存在并行执行或竞态。 |

#### TC-BT-006：默认实现可直接使用（FR-BT-002）

| 项 | 值 |
|----|-----|
| **测试目标** | 派生类不重写任何钩子时，BaseTask 默认实现也能跑通。 |
| **前置条件** | `class EmptyTask extends BaseTask {}`。 |
| **输入** | `new EmptyTask().exec({}, { flowId: "f1" })` |
| **预期结果** | 不抛异常，返回 `{}`（`onExec` 默认空对象）。 |
| **验证点** | 默认 `onInitialize` 视为 `true`；默认 `onExec` 返回 `{}`；默认 `onDestroy` 不抛。 |

### 2.2 ignoreFailure 转义

#### TC-BT-007：ignoreFailure=false（默认）+ onExec 抛异常 → 原异常 rethrow（FR-BT-005, FR-BT-007）

| 项 | 值 |
|----|-----|
| **测试目标** | 默认配置下失败硬抛。 |
| **输入** | `params = {}`（`ignoreFailure` 缺省），`onExec` 抛 `new Error("e")`。 |
| **预期结果** | `exec` 抛出原异常（不是 wrap）。 |
| **验证点** | 抛出的异常 `=== originalError`。 |

#### TC-BT-008：ignoreFailure=true + onExec 抛异常 → 标准结果体（FR-BT-004, FR-BT-007）

| 项 | 值 |
|----|-----|
| **测试目标** | ignoreFailure 路径返回标准失败体。 |
| **输入** | `params = { ignoreFailure: true }`，`onExec` 抛 `new Error("xy")`。 |
| **预期结果** | `exec` 不抛异常，返回 `{ done: true, success: false, ignored: true, error: "xy" }`。 |
| **验证点** | 字段精确相等；不含 `stdout` / `exitCode` / 任何子类自有字段。 |

#### TC-BT-009：ignoreFailure=true + onInitialize 返回 false → 标准结果体（FR-BT-004, FR-BT-007, Q15）

| 项 | 值 |
|----|-----|
| **测试目标** | onInitialize 返回 false 同样遵从 ignoreFailure。 |
| **输入** | `params = { ignoreFailure: true }`，`onInitialize` 返回 `false`。 |
| **预期结果** | `exec` 返回 `{ done: true, success: false, ignored: true, error: "onInitialize returned false" }`。 |
| **验证点** | `onExec` 未被调用；`onDestroy` 被调用；`error` 字段为固定文案。 |

#### TC-BT-010：ignoreFailure=true + onInitialize 抛异常 → 标准结果体（FR-BT-004, Q15）

| 项 | 值 |
|----|-----|
| **测试目标** | onInitialize 抛异常路径同样被 ignoreFailure 吞掉。 |
| **输入** | `params = { ignoreFailure: true }`，`onInitialize` 抛 `new Error("ie")`。 |
| **预期结果** | `exec` 返回 `{ done: true, success: false, ignored: true, error: "ie" }`。 |
| **验证点** | `onDestroy` 仍被调用；返回体不含原异常 stack 字段。 |

#### TC-BT-011：ignoreFailure=true + 成功路径 → 原样返回 onExec 结果（FR-BT-006）

| 项 | 值 |
|----|-----|
| **测试目标** | ignoreFailure 不影响成功路径。 |
| **输入** | `params = { ignoreFailure: true }`，`onExec` 返回 `{ done: true, success: true, foo: 1 }`。 |
| **预期结果** | `exec` 返回 `{ done: true, success: true, foo: 1 }`，未加 `ignored` 字段。 |
| **验证点** | 成功路径返回值与 `onExec` 严格相等。 |

#### TC-BT-012：ignoreFailure 仅接受布尔 true（FR-BT-007）

| 项 | 值 |
|----|-----|
| **测试目标** | 字符串 `"true"` 等真值不被识别为 `true`。 |
| **输入** | `params = { ignoreFailure: "true" }`，`onExec` 抛异常。 |
| **预期结果** | `exec` 抛出原异常（按 ignoreFailure=false 处理）。 |
| **验证点** | 仅严格 `=== true` 才进入 ignore 分支。 |

### 2.3 onDestroy 异常处理

#### TC-BT-013：onDestroy 抛异常 + 之前成功 → 不影响成功判定（FR-BT-003, Q16）

| 项 | 值 |
|----|-----|
| **测试目标** | onDestroy 异常被吞，最终仍按 onExec 成功判定。 |
| **输入** | `onExec` 返回 `{ done: true, success: true, x: 1 }`，`onDestroy` 抛 `new Error("d boom")`。 |
| **预期结果** | `exec` 返回 `{ done: true, success: true, x: 1 }`，不抛异常。 |
| **验证点** | error 级日志含 `"onDestroy threw"` 与 `err: "d boom"`。 |

#### TC-BT-014：onDestroy 抛异常 + 之前 onExec 失败 → 仍以 onExec 失败为终判（FR-BT-005, Q16）

| 项 | 值 |
|----|-----|
| **测试目标** | onExec 异常优先，onDestroy 异常不覆盖原异常。 |
| **输入** | `params = {}`（无 ignoreFailure），`onExec` 抛 `Error("E")`，`onDestroy` 抛 `Error("D")`。 |
| **预期结果** | `exec` 抛出 `Error("E")`，不是 `Error("D")`。 |
| **验证点** | 抛出的异常 message 为 `"E"`；error 日志中存在 `"onDestroy threw"`。 |

#### TC-BT-015：onDestroy 抛异常 + ignoreFailure=true → 标准结果体（含原失败原因）（FR-BT-004, Q16）

| 项 | 值 |
|----|-----|
| **测试目标** | ignoreFailure 路径下，onDestroy 异常仍被吞，结果体的 error 取自 onExec 的异常。 |
| **输入** | `params = { ignoreFailure: true }`，`onExec` 抛 `Error("E")`，`onDestroy` 抛 `Error("D")`。 |
| **预期结果** | `exec` 返回 `{ done: true, success: false, ignored: true, error: "E" }`。 |
| **验证点** | `error` 字段为 `"E"`，不是 `"D"`。 |

### 2.4 context / task 参数处理

#### TC-BT-016：完整 context + task → 日志含全部字段（FR-BT-008, FR-BT-009, FR-BT-011）

| 项 | 值 |
|----|-----|
| **测试目标** | 在标准调用下，子类内 `this.log.info` 输出的日志含 `flowId / name / taskCode / flowPhase`。 |
| **输入** | `exec({}, { flowId: "F1", flowPhase: "main" }, { code: "stepA" })`，`onExec` 中 `this.log.info("hi")`。 |
| **预期结果** | 捕获到的日志条目字段满足 `flowId="F1"`，`flowPhase="main"`，`name="TestableTask"`，`taskCode="stepA"`。 |
| **验证点** | 4 个字段全部存在且取值正确。 |

#### TC-BT-017：缺失 context → flowId/flowPhase 兜底（FR-BT-008, NFR-BT-002）

| 项 | 值 |
|----|-----|
| **测试目标** | 直接 `new XxxTask().exec({})` 不抛异常，日志兜底字段正确。 |
| **输入** | `exec({})`（无 context、无 task）。 |
| **预期结果** | 日志含 `flowId="<standalone>"`，`flowPhase="main"`，`taskCode="<unknown>"`，`name="TestableTask"`。 |
| **验证点** | 不抛异常；4 个字段存在且为兜底值。 |

#### TC-BT-018：缺失 task 参数 → taskCode 兜底（FR-BT-009）

| 项 | 值 |
|----|-----|
| **测试目标** | 仅缺失 `task` 时，其他字段正常注入。 |
| **输入** | `exec({}, { flowId: "F2", flowPhase: "error" })`（无 task）。 |
| **预期结果** | 日志含 `flowId="F2"`，`flowPhase="error"`，`taskCode="<unknown>"`。 |
| **验证点** | flowPhase 取 `"error"`（不被默认值覆盖）；taskCode 兜底。 |

#### TC-BT-019：context 字段类型异常 → 兜底处理（FR-BT-008）

| 项 | 值 |
|----|-----|
| **测试目标** | `context.flowId` 为非字符串（例如 number）时，BaseTask 不抛异常。 |
| **输入** | `exec({}, { flowId: 123 })`。 |
| **预期结果** | 不抛异常；日志中 `flowId` 字段值为 `123`（pino 接受任意类型作为 child 字段）。 |
| **验证点** | BaseTask 不主动校验类型，行为容错。 |

### 2.5 实现类名（name）与日志默认 child

#### TC-BT-020：name 字段取自 this.constructor.name（FR-BT-010）

| 项 | 值 |
|----|-----|
| **测试目标** | `name` 在构造时即可访问且等于类名。 |
| **输入** | `class FooTask extends BaseTask {}; const t = new FooTask();` |
| **预期结果** | `t.name === "FooTask"`。 |
| **验证点** | 不依赖 exec 调用即可读取。 |

#### TC-BT-021：构造期访问 this.log 不抛异常（FR-BT-011）

| 项 | 值 |
|----|-----|
| **测试目标** | 子类构造函数中调用 `this.log.info(...)` 时，至少 `name` 字段已注入，且不抛异常。 |
| **前置条件** | 派生类构造函数中调用 `this.log.info({}, "ctor")`。 |
| **输入** | `new TestableTask()`（不调用 exec）。 |
| **预期结果** | 不抛异常；日志条目至少含 `name="TestableTask"`，`flowId` 字段不存在或不被设置。 |
| **验证点** | 兜底 child logger 可用。 |

### 2.6 BaseTask 不维护状态字段

#### TC-BT-022：BaseTask 实例上不暴露 status 字段（FR-BT-012）

| 项 | 值 |
|----|-----|
| **测试目标** | 实例上不存在 `status` / `state` 等枚举字段，确保 BaseTask 与需求定义一致。 |
| **输入** | `Object.keys(new TestableTask())`。 |
| **预期结果** | 不含 `status` / `state` 键。 |
| **验证点** | 仅 `name` / `log`（及子类自有字段）。 |

### 2.7 子类禁止重写 exec 的行为契约（指引性测试）

#### TC-BT-023：子类 override onExec 后 exec 仍由 BaseTask 编排（FR-BT-001）

| 项 | 值 |
|----|-----|
| **测试目标** | 子类正确 override `onExec`（而非 `exec`）时，BaseTask 的生命周期编排仍生效。 |
| **输入** | `class FooTask extends BaseTask { protected override onExec() { return { x: 1 }; } }`，调用 `exec({}, { flowId: "f" })`。 |
| **预期结果** | 返回 `{ x: 1 }`，`onInitialize` 默认调用，`onDestroy` 默认调用。 |
| **验证点** | 返回值原样透传；BaseTask 不附加 `done` / `success`。 |

> 说明：`exec` 是否被 `final` 化由 TypeScript 类型系统约束有限，本契约以代码评审 + 文档约束为主。本测试用例确保"正确做法"行为可预期，反向"错误做法"的运行时行为不在本测试覆盖。

### 2.8 与 TaskFlowEngine 的集成

#### TC-BT-024：通过 TaskFlowEngine 启动 → 任务收到 flowId 与 flowPhase=main（FR-BT-013）

| 项 | 值 |
|----|-----|
| **测试目标** | `TaskFlowEngine.createFlow()` 创建 flow 后，BaseTask 派生任务能从 context 中取到正确的 `flowId` 与 `flowPhase: "main"`。 |
| **前置条件** | 注册一个 `class CaptureTask extends BaseTask`，其 `onExec` 把 `context` 浅拷贝写入闭包变量。 |
| **输入** | DAG 仅一个任务节点 `step1` 解析为 `CaptureTask`；`createFlow("internal", dag, {}, [...], undefined)`。 |
| **预期结果** | 闭包捕获到 `context.flowId === <生成的 flowId>`，`context.flowPhase === "main"`。 |
| **验证点** | flowId 等于 `FlowSummary.id`；不被 setFlowContext 中可能的旧值覆盖。 |

#### TC-BT-025：errorDag 启动 → 任务收到 flowPhase="error"（FR-BT-013）

| 项 | 值 |
|----|-----|
| **测试目标** | 主 DAG 失败触发 errorDag 时，errorDag 中的 BaseTask 派生任务收到的 `flowPhase` 为 `"error"`，`flowId` 与主 DAG 一致。 |
| **前置条件** | 主 DAG 含一个必失败任务，errorDag 含一个 `CaptureTask`。 |
| **输入** | `createFlow(..., dag, ..., errorDag)`。 |
| **预期结果** | CaptureTask 捕获到 `flowPhase === "error"`，`flowId` 与主 flow 的 id 相同。 |
| **验证点** | errorDag 启动时 context 字段被正确切换。 |

#### TC-BT-026：setFlowContext 中的同名字段被引擎覆盖（FR-BT-013）

| 项 | 值 |
|----|-----|
| **测试目标** | 用户调用 `setFlowContext({ flowId: "user-set" })` 时，引擎注入的 `flowId` 仍以本次启动的实际 flow id 为准。 |
| **输入** | 启动前 `engine.setFlowContext({ flowId: "user-set", memStore })`。 |
| **预期结果** | CaptureTask 捕获到 `context.flowId === <实际 flowId>`，不是 `"user-set"`；其他用户字段（如 `memStore`）仍可见。 |
| **验证点** | 引擎注入字段优先级高于用户自定义同名字段；非冲突字段保留。 |

#### TC-BT-027：引擎级 flowContext 不被并发互相污染（FR-BT-013, NFR-BT-001）

| 项 | 值 |
|----|-----|
| **测试目标** | 并发启动两个 flow，各自任务收到的 `flowId` 不混淆。 |
| **前置条件** | CaptureTask 用 `await sleep(10)` 制造交错。 |
| **输入** | 几乎同时 `createFlow(...)` 两次，每次 DAG 含一个 CaptureTask。 |
| **预期结果** | 两个任务捕获到的 `flowId` 分别等于各自的 flowSummary.id，不会互相覆盖。 |
| **验证点** | `engine.flowContext` 自身在两次启动间不被污染（即不会出现"第二个 flow 启动后第一个任务的 context.flowId 变成第二个 flow 的 id"）。 |

### 2.9 子任务迁移完整性回归

#### TC-BT-028：所有 real / mock 任务均派生自 BaseTask（AC-BT-001）

| 项 | 值 |
|----|-----|
| **测试目标** | 静态保证：迁移后 `tasks/` 下不再存在 `implements ITaskResolver`。 |
| **检查方式** | 在测试中通过 `import` 所有任务类，断言每个类的 `prototype` instanceof BaseTask（运行期断言）；并由 CI 添加 grep 规则禁止新代码 `implements ITaskResolver`（除 BaseTask 本身）。 |
| **输入** | 遍历 `tasks/index.ts` 导出。 |
| **预期结果** | 每个导出类的 `prototype` 是 BaseTask 的子类原型链。 |
| **验证点** | 100% 覆盖。 |

#### TC-BT-029：现有任务流引擎用例 0 失败（AC-BT-007）

| 项 | 值 |
|----|-----|
| **测试目标** | BaseTask 引入与任务迁移后，`task_flow_engine_test_cases.md` 中的全部用例（TC-TFE-*）继续通过。 |
| **检查方式** | 跑 `npm run test`（或对应命令），断言 0 失败。 |

#### TC-BT-030：二级基类不再处理 ignoreFailure（AC-BT-008）

| 项 | 值 |
|----|-----|
| **测试目标** | `SshCommandTask` / `SshFileTransferTask` 在 `params.ignoreFailure=true` 下抛异常时，由 BaseTask 转义为标准失败体；这两个子类不再含 `ignoreFailure` 判断分支。 |
| **检查方式** | ① **静态**：grep `SshCommandTask` 与 `SshFileTransferTask` 源文件，断言不再出现 `ignoreFailure` 标识符。② **动态（SshCommandTask）**：构造一个 SSH 命令必失败场景（`exitCode != 0` 重试耗尽），`params.ignoreFailure=true`，断言 BaseTask 返回 `{ done:true, success:false, ignored:true, error: <string> }`，**不**含 `stdout` / `stderr` / `exitCode` 字段。③ **动态（SshFileTransferTask）**：同款构造（远端连接持续失败重试耗尽），断言返回体同上，不含 `bytesTransferred` / `localChecksum` / `remoteChecksum` / `integrityVerified`。 |
| **预期结果** | 静态、动态断言全部通过。 |
| **被影响的现有用例（必须随实施 PR 同步更新）** | 当前 `src/backend/src/test.ts` 中显式断言 ignoreFailure partial result 的位置仅 `test.ts:1253-1269`（`TC-TFE-053`，针对 `WaitSshConnectedTask`）。该用例属于"等待型任务" —— 见 TC-BT-031 —— 其 partial result 行为按设计文档保留，TC-TFE-053 **不需要修改**。SshCommandTask / SshFileTransferTask 在现有 `test.ts` 中没有显式的 `ignoreFailure: true` + 失败路径用例（grep 结果验证），因此实施 PR 需 **新增** 对应单元测试覆盖动态断言。 |
| **验证点** | partial result 字段不再存在；`ignored: true` 字段存在；error 字段为子类抛出的异常 message。 |

#### TC-BT-031：等待型任务 ignoreFailure 行为保留（FR-BT-007 注释，AC-BT-008 例外条款）

| 项 | 值 |
|----|-----|
| **测试目标** | `sshConnectionWait` / `WaitSshConnectedTask` / `WaitSshDisconnectedTask` / `WaitSshReconnectTask` 在 `params.ignoreFailure=true` 下走内部 soft-failure 返回路径（不抛异常），返回体仍包含 `state` / `attempts` / `elapsedMs` / `error` 字段；BaseTask 不介入转义。 |
| **检查方式** | 复用现有 TC-TFE-053（`task_flow_engine_test_cases.md` 第 582-590 行），断言其原有预期结果在 BaseTask 引入后**不变**：`{ done:true, success:false, state:"disconnected", error: /Timed out/ }`。即 BaseTask 引入与等待型任务的现有契约**正交**，不破坏。 |
| **预期结果** | TC-TFE-053 在 BaseTask 引入后继续通过；返回体不含 `ignored: true`（因为不是 BaseTask 转义路径）。 |
| **验证点** | 等待型任务的 partial result 字段（`state` / `attempts` / `elapsedMs`）保留；不出现 `ignored` 字段。 |

---

## 3. 用例与需求/验收标准对应关系

| 需求 / 验收 | 覆盖用例 |
|-------------|---------|
| FR-BT-001 实现 ITaskResolver | TC-BT-023, TC-BT-028 |
| FR-BT-002 生命周期签名与默认实现 | TC-BT-001, TC-BT-005, TC-BT-006 |
| FR-BT-003 生命周期顺序 | TC-BT-001 ~ TC-BT-005, TC-BT-013, TC-BT-014 |
| FR-BT-004 失败标准化结果体 | TC-BT-008, TC-BT-009, TC-BT-010, TC-BT-015 |
| FR-BT-005 失败硬抛 | TC-BT-002, TC-BT-003, TC-BT-004, TC-BT-007, TC-BT-014 |
| FR-BT-006 成功原样返回 | TC-BT-011, TC-BT-023 |
| FR-BT-007 ignoreFailure 字段来源 | TC-BT-007, TC-BT-008, TC-BT-012 |
| FR-BT-008 context 解析 | TC-BT-016, TC-BT-017, TC-BT-019 |
| FR-BT-009 task.code 解析 | TC-BT-016, TC-BT-018 |
| FR-BT-010 实现类名采集 | TC-BT-020 |
| FR-BT-011 日志注入 | TC-BT-016, TC-BT-017, TC-BT-021 |
| FR-BT-012 不维护状态字段 | TC-BT-022 |
| FR-BT-013 TaskFlowEngine 注入 | TC-BT-024, TC-BT-025, TC-BT-026, TC-BT-027 |
| FR-BT-014 子任务全量迁移 | TC-BT-028 |
| FR-BT-015 重试保留二级基类 | TC-BT-030（间接：通过验证 SshCommandTask 仍能在 ignoreFailure=false + 重试耗尽时抛异常） |
| AC-BT-001 | TC-BT-028 |
| AC-BT-002 | TC-BT-016, TC-BT-024 |
| AC-BT-003 | TC-BT-008 |
| AC-BT-004 | TC-BT-007 |
| AC-BT-005 | TC-BT-002 |
| AC-BT-006 | TC-BT-013, TC-BT-014, TC-BT-015 |
| AC-BT-007 | TC-BT-029 |
| AC-BT-008 | TC-BT-030, TC-BT-031 |
| AC-BT-009 | TC-BT-017 |

---

## 4. 备注

- 所有测试用例日志断言推荐统一通过 `configureLogger({ logsDir: <tmp> })` 切到临时目录后读取 `app.log` 文件（JSON Lines）解析；或在测试前后分别 hook root logger 的 `child` 方法记录 bindings。两种方式择一即可，与现有 `system_logs_test_cases.md` 模式保持一致。
- 并发用例 TC-BT-027 推荐使用真实的 `flowed` Flow 实例并发启动；不要 mock flowed 自身。
- TC-BT-026 / TC-BT-027 的实现可直接扩展 `task_flow_engine_test_cases.md` 中现有的"setFlowContext"相关用例，避免重复脚手架。
