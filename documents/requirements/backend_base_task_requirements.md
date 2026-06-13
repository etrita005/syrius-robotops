# 后端任务基类（BaseTask） — 需求规格说明书

## 1. 概述

`BaseTask` 是后端所有任务（Task Resolver）的统一基类。它封装与具体业务无关的通用关注点：与 `flowed` 任务流引擎的接入约定、任务的生命周期编排（初始化 / 执行 / 清理）、忽略失败（`ignoreFailure`）的语义转义、以及自动注入 `flowId`、实现类名、DAG 任务编码（`taskCode`）的结构化日志。

本次需求引入 `BaseTask` 后，`src/backend/src/tasks/` 下所有 real / mock 任务都将统一从 `BaseTask` 派生，移除散落在子类中的 `ignoreFailure` 处理与重复样板代码，从而显著减少冗余、提升日志可追溯性、并为后续在基类层级扩展更多通用能力（如指标采集、追踪、限流）提供单一切入点。

**关键用例**：FAE 通过任务流执行 BSP 升级，若其中某一步设置了 `ignoreFailure: true`，BaseTask 在该步抛异常时将异常吞掉并返回标准化的失败结果体，使得后续步骤可以继续；同时所有该步的日志条目自动带上 `flowId` 与 `name`，便于事后排障。

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **BaseTask** | 后端所有任务的统一抽象基类，实现 `flowed` 的 `ITaskResolver` 接口，提供生命周期编排与日志注入能力。 |
| **生命周期方法** | `onInitialize` / `onExec` / `onDestroy` 三个方法，构成 BaseTask 的执行编排骨架，由子类按需重写。 |
| **任务编码（taskCode）** | DAG 中由作者赋予该任务节点的逻辑名称（如 `step1`、`uploadBup`），从 `flowed` 框架传入 `exec()` 的 `task.code` 中获取。 |
| **实现类名（name）** | 该任务对应的 TypeScript 类名，通过 `this.constructor.name` 获取（如 `SshCommandTask`）。 |
| **flowId** | 当前任务流实例的唯一标识，由 `TaskFlowEngine` 在启动 flow 时通过 `context` 注入。 |
| **flowPhase** | 当前任务所处 DAG 阶段，取值 `main`（主 DAG）或 `error`（异常处理 DAG）。 |
| **忽略失败（ignoreFailure）** | DAG 输入参数 `params.ignoreFailure`，为 `true` 时 BaseTask 在子类抛异常或 `onInitialize` 返回 `false` 时吞掉失败，返回标准化失败结果体使流可以继续。 |
| **二级基类** | 在 BaseTask 与具体任务之间的中间抽象基类，例如 `SshCommandTask`、`SshFileTransferTask`，封装协议级别的通用逻辑。 |

---

## 3. 设计原则

1. **与业务解耦**：BaseTask 不感知任何业务概念（机器人、升级、文件传输等），仅提供编排与日志骨架。
2. **生命周期固定**：所有派生任务的执行流程一律按 `onInitialize → onExec → onDestroy` 顺序进行，子类不可改写顺序，仅可重写各阶段的实现。
3. **失败由异常表达**：`onExec` 通过抛异常表达失败，返回值仅在成功路径有效。是否 rethrow 由 BaseTask 根据 `ignoreFailure` 决定。
4. **清理必然执行**：`onDestroy` 不论前面阶段成功或失败都会被调用，作为资源释放点；`onDestroy` 自身的异常不影响最终任务的成功 / 失败判定。
5. **日志结构化**：BaseTask 通过 pino 的 `child()` 注入 `flowId / name / taskCode / flowPhase`，子类直接使用 `this.log` 输出日志，不引入新 API。
6. **最小重构面**：本次引入 BaseTask 仅接管"生命周期 + 日志注入 + ignoreFailure 转义"。重试等更专属的关注点暂不下沉，保留在 `SshCommandTask` 等二级基类中。
7. **零业务字段注入**：BaseTask 不在成功路径强制附加 `done` / `success` 等字段，`onExec` 的返回值原样传给 `flowed`。`done`/`success` 字段约定由 DAG 与子任务自行约定。

---

## 4. 功能需求

### FR-BT-001：实现 ITaskResolver 接口

`BaseTask` 实现 `flowed` 的 `ITaskResolver` 接口，签名为：

```ts
exec(params: ValueMap, context?: ValueMap, task?: Task, debug?: Debugger, log?: LoggerFn): Promise<ValueMap>
```

`exec` 方法由 BaseTask 定义为 `final`（约定不被子类重写），子类只能通过重写 `onInitialize`、`onExec`、`onDestroy` 来定制行为。

### FR-BT-002：生命周期方法签名与默认实现

BaseTask 暴露三个 `protected` 生命周期方法，子类按需重写。默认行为如下：

| 方法 | 签名 | 默认实现 |
|------|------|----------|
| `onInitialize` | `() => OptPromise<boolean>` | 返回 `true` |
| `onExec` | `(params: ValueMap, context?: ValueMap) => OptPromise<ValueMap>` | 返回 `{}` |
| `onDestroy` | `() => OptPromise<void>` | 空操作 |

`OptPromise<T>` 表示子类可同步或异步实现，签名沿用 `flowed` 的同名类型。

### FR-BT-003：生命周期编排顺序

BaseTask.exec 内部按以下顺序调度生命周期方法：

```
1. onInitialize()
   - 返回 true  → 进入 2
   - 返回 false → 跳过 2，进入 3，最终判定为失败
   - 抛异常     → 跳过 2，进入 3，最终判定为失败（异常对象保留）
2. onExec(params, context)
   - 返回 ValueMap → 进入 3，最终判定为成功
   - 抛异常        → 进入 3，最终判定为失败（异常对象保留）
3. onDestroy()
   - 始终执行
   - 自身抛异常时，BaseTask 仅记录 error 日志，不影响最终判定
```

### FR-BT-004：失败的标准化结果体

当最终判定为失败 **且** `ignoreFailure === true` 时，BaseTask 返回如下 ValueMap，不向上抛出异常：

```ts
{
  done: true,
  success: false,
  ignored: true,
  error: <string>,   // 异常的 message；onInitialize 返回 false 时为固定文案
}
```

字段语义：

| 字段 | 取值 | 说明 |
|------|------|------|
| `done` | `true` | 满足 `flowed` `provides` 约定，使下游任务可以继续推进。 |
| `success` | `false` | 标记本次执行业务上不成功。 |
| `ignored` | `true` | 标记此次失败已被 BaseTask 吞掉，区别于子类自己返回的非成功结果。 |
| `error` | `string` | 失败原因。`onInitialize` 返回 `false` 时取固定文案（详见设计文档）。 |

BaseTask **不会**在该结果中保留 `onExec` 抛异常前已经计算出的中间数据（不提供 partial result 能力）。如果子类希望在失败路径携带数据，应在 `onExec` 内部自行 try/catch 并以正常返回值表达，不依赖 ignoreFailure 机制。

### FR-BT-005：失败的硬抛出

当最终判定为失败 **且** `ignoreFailure === false`（含未传值）时：

- 若失败由 `onExec` 或 `onInitialize` 抛异常导致，BaseTask 将该异常**原样 rethrow** 给 `flowed`。
- 若失败由 `onInitialize` 返回 `false` 导致，BaseTask 抛出一个 `Error`，`message` 为固定文案 `'onInitialize returned false'`。

### FR-BT-006：成功路径的返回

当最终判定为成功时，BaseTask 将 `onExec` 的返回值**原样**返回给 `flowed`，不附加任何字段。子任务负责按 DAG 约定输出 `done` / `success` 等字段。

### FR-BT-007：ignoreFailure 字段来源与默认值

`ignoreFailure` 仅来自 DAG 输入 `params.ignoreFailure`，类型 `boolean`，缺省为 `false`。BaseTask 在 `exec` 入口集中读取一次。子类（包括二级基类）**不再处理** `params.ignoreFailure`：

- 在 `SshCommandTask` 重构中，需移除其内部对 `ignoreFailure` 的所有判断分支（`SshCommandTask` 的失败路径通过抛异常表达，全权交由 BaseTask 转义）。
- `sshConnectionWait` / `WaitSshReconnectTask` 等"等待型"任务存在内部 soft-failure 返回路径（即超时时不抛异常，而是显式返回 `{ done: true, success: false, state, attempts, elapsedMs, error }` 携带业务字段）。本需求 **不要求** 它们改造为"统一抛异常 + BaseTask 转义"模式：这些任务可以继续读取 `params.ignoreFailure` 以决定走"抛异常"或"soft-failure 返回"两条路径。原因是其 partial result 字段（`state` / `attempts` / `elapsedMs`）在现有 DAG 与测试中已被消费，强行迁移会破坏既有契约。
- 当子类同时存在"抛异常"与"soft-failure 返回"两条失败路径时：抛异常路径走 BaseTask 转义；soft-failure 返回路径由子类自行控制结果体（不会被 BaseTask 二次包装）。两条路径可由 `params.ignoreFailure` 触发分支，由子类自行解释；BaseTask 的 ignoreFailure 转义仅作用于"未捕获异常"。
- 子类如需在失败路径主动产出非成功结果（`success: false` 但不抛异常），由子类自行实现，不与 BaseTask 的 `ignoreFailure` 机制冲突或叠加。

### FR-BT-008：从 context 中读取 flowId 与 flowPhase

BaseTask 从 `exec` 的第二个参数 `context` 中读取：

| 字段 | 类型 | 缺失时取值 |
|------|------|-----------|
| `context.flowId` | `string` | `'<standalone>'` |
| `context.flowPhase` | `'main' \| 'error'` | `'main'` |

`flowId` 和 `flowPhase` 的写入方由 `TaskFlowEngine` 负责（详见 FR-BT-013）。BaseTask 不主动校验类型，缺失或类型不符均使用兜底值，不抛异常，以保证子类在单元测试中可独立 `new XxxTask().exec(params)` 调用。

### FR-BT-009：从 task 参数中读取 taskCode

BaseTask 从 `exec` 的第三个参数 `task` 中读取 `task.code` 作为 `taskCode`。`task` 缺失时 `taskCode` 取 `'<unknown>'`。

### FR-BT-010：实现类名采集

BaseTask 通过 `this.constructor.name` 获取实现类名作为 `name`。该值在构造时计算并缓存到实例字段 `name` 上。

### FR-BT-011：日志注入

BaseTask 暴露 `protected log: Logger`（`pino` 实例），通过对 `rootLogger.child()` 加注以下字段构造：

```ts
{
  flowId: <string>,
  name: <string>,
  taskCode: <string>,
  flowPhase: 'main' | 'error',
}
```

子类直接通过 `this.log.info(...)`、`this.log.error(...)` 等 pino 原生 API 输出日志，BaseTask 不再封装 `logInfo()` / `logError()` 之类的别名 API，以保持与项目现有 pino 风格一致。

由于 `flowId / taskCode / flowPhase` 在构造期未知（仅在 `exec` 调用期可得），`this.log` 在 `exec` 入口处才被赋值；在 `exec` 之外（构造函数中、未经引擎调度直接调用方法时）访问 `this.log` 应得到一个仅含 `name` 字段的兜底 child logger，不抛异常。

### FR-BT-012：BaseTask 不维护任务状态字段

BaseTask 不持有"未执行 / 执行中 / 成功 / 失败"等状态机字段。任务的运行状态由 `flowed` 与 `TaskFlowEngine` 各自的状态机维护（`TaskState`），无需在 resolver 层重复表达。

### FR-BT-013：TaskFlowEngine 注入 flowId 与 flowPhase 到 context

`TaskFlowEngine` 在每次调用 `Flow.start()` 时，必须为该次启动构造**独立**的 context 对象，注入 `flowId` 与 `flowPhase`：

- 主 DAG 启动：`{ ...flowContext, flowId, flowPhase: 'main' }`
- 异常 DAG 启动：`{ ...flowContext, flowId, flowPhase: 'error' }`

不得直接修改 `this.flowContext` 引擎共享对象（避免并发覆盖）。

### FR-BT-014：所有现有任务统一迁移到 BaseTask

`src/backend/src/tasks/` 下所有任务（real 与 mock）迁移到 `extends BaseTask`：

- 直接 `implements ITaskResolver` 的任务，改为 `extends BaseTask`，原 `exec` 主体迁移为 `onExec`。
- 已有继承关系的任务（如 `UpgradeBUPTask extends SshCommandTask`），仅当二级基类（`SshCommandTask`）已迁移完成后随之自动适配，无需直接改动。
- mock 任务：
  - 独立的 mock（如 `MockSshCommandTask`）：迁移到 `extends BaseTask` + `onExec`。
  - 继承真实任务的 mock（如 `MockUpdateRobotBasicInfoTask extends UpdateRobotBasicInfoTask`）：必须 override `onExec` 而非 `exec`。

### FR-BT-015：重试逻辑保留在二级基类

本次重构**不**将重试逻辑下沉到 BaseTask。`SshCommandTask` 与 `SshFileTransferTask` 中的 retry 循环保留在子类的 `onExec` 内部。后续如需统一重试，将另行设计。

---

## 5. 非功能需求

### NFR-BT-001：兼容性

- BaseTask 的引入不改变 `flowed` 库的版本与对外接口，DAG 定义文件无需修改。
- `params` / `provides` 字段命名保持向后兼容：`done`、`success`、`error` 等已被外部依赖的字段语义不变。

### NFR-BT-002：可独立测试

任何派生类应当能够脱离 `TaskFlowEngine` 直接 `new` 后调用 `exec(params)` 进行单元测试，BaseTask 须容忍 `context` / `task` 参数的缺失。

### NFR-BT-003：日志开销

BaseTask 在每次 `exec` 调用时产生一个 child logger 实例。child logger 是 pino 的轻量结构（共享 root logger 的 transport），允许每次 `exec` 重建，无需缓存。

### NFR-BT-004：错误信息可读性

`error` 字段在 ignoreFailure 路径下只取 `Error.message`，不序列化 stack；完整 stack 由 BaseTask 在 error 级日志中输出，避免污染下游数据流。

### NFR-BT-005：编码风格一致性

BaseTask 的实现遵循现有项目约定：TypeScript + ES Modules、pino 结构化日志、英文 ASCII 日志与注释、不使用 `console.*`。

---

## 6. 接口契约（对子类）

子类（直接派生 BaseTask 或派生二级基类）应遵守以下契约：

| 契约 | 说明 |
|------|------|
| **不重写 `exec`** | 禁止重写 `BaseTask.exec`。若需自定义行为，请重写生命周期方法。 |
| **不读取 `params.ignoreFailure`** | 该字段已被 BaseTask 接管，子类读取或处理它属于反模式。 |
| **失败用异常表达** | `onExec` 若需要表达失败，统一抛异常；不要返回带 `success: false` 的结果体（除非确实需要在失败路径上携带业务数据，此时不依赖 ignoreFailure 机制）。 |
| **使用 `this.log`** | 子类不应再调用顶层 `createLogger("XxxModule")`，统一使用 `this.log` 输出日志，确保字段一致。 |
| **`onInitialize` 可同步** | 若不涉及异步资源，可直接返回 `true`，无需 `Promise`。 |
| **`onDestroy` 不抛业务错误** | `onDestroy` 应仅做资源清理，业务错误请提前在 `onExec` 中表达。`onDestroy` 抛错只会被记 error 日志，不会影响最终判定。 |

---

## 7. 范围外

以下事项**不**在本次需求范围内：

- **重试机制下沉**：保留在 `SshCommandTask` / `SshFileTransferTask` 等二级基类中。
- **超时控制**：BaseTask 不提供统一的总执行超时，子类自行处理。
- **任务状态字段**：BaseTask 不持有运行态枚举字段（详见 FR-BT-012）。
- **指标 / 追踪埋点**：可作为后续在 BaseTask 层级扩展的能力，本次不实现。
- **DAG 层面的字段约定变化**：本次不调整 `done` / `success` / `ignoreFailure` 字段的现有命名与默认值。
- **子任务测试用例**：BaseTask 的测试用例设计独立成文，不重做每个子任务的测试。

---

## 8. 验收标准

| 编号 | 标准 |
|------|------|
| AC-BT-001 | 所有 `src/backend/src/tasks/real/` 与 `src/backend/src/tasks/mock/` 下任务，无一保留 `implements ITaskResolver`，全部 `extends BaseTask`（直接或经二级基类间接）。 |
| AC-BT-002 | 任意子任务执行时，日志条目均自动带有 `flowId`、`name`、`taskCode`、`flowPhase` 四个字段。 |
| AC-BT-003 | DAG 输入 `ignoreFailure: true` 时，子类抛异常不会终结 flow，BaseTask 返回 `{ done: true, success: false, ignored: true, error }`。 |
| AC-BT-004 | DAG 输入 `ignoreFailure: false` 或缺省时，子类抛异常被原样 rethrow 给 `flowed`。 |
| AC-BT-005 | `onInitialize` 返回 `false` 时 `onExec` 不被调用，`onDestroy` 仍被调用。 |
| AC-BT-006 | `onDestroy` 抛异常时被记录为 error 日志，但不改变最终任务的成功 / 失败判定。 |
| AC-BT-007 | 现有 `task_flow_engine_test_cases.md` 中所有用例在 BaseTask 引入后仍全部通过。 |
| AC-BT-008 | `SshCommandTask` / `SshFileTransferTask` 不再含有任何对 `params.ignoreFailure` 的判断（失败统一抛异常，由 BaseTask 转义）。`sshConnectionWait` / `WaitSshReconnectTask` 因保留内部 soft-failure 返回路径，可继续读取 `params.ignoreFailure`，但不得对"已抛出的异常"再做 ignoreFailure 包装（避免与 BaseTask 双重处理）。 |
| AC-BT-009 | 直接 `new XxxTask().exec({ ... })` 调用（无 context、无 task 参数）不抛异常，日志中 `flowId` 显示为 `<standalone>`，`taskCode` 显示为 `<unknown>`。 |
