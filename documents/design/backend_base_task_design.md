# 后端任务基类（BaseTask） — 软件设计文档

> 本文档依据《后端任务基类（BaseTask）需求规格说明书》编写，覆盖所有功能需求 FR-BT-001 至 FR-BT-015。

---

## 1. 模块定位

`BaseTask` 是后端 `src/backend/src/tasks/` 下所有任务的统一基类，介于 `flowed` 框架的 `ITaskResolver` 接口与具体业务任务之间。它实现 `ITaskResolver`，集中处理生命周期、日志注入与 `ignoreFailure` 转义；同时保留对二级基类（`SshCommandTask`、`SshFileTransferTask`）现有重试逻辑的兼容。

```
flowed.ITaskResolver
        │ implements
        ▼
   BaseTask (本次新增)
        │ extends
        ├──── SshCommandTask（二级基类，保留重试逻辑）
        │         └── UpgradeBUPTask / UpgradeMovebaseTask / ...
        ├──── SshFileTransferTask（二级基类，保留重试逻辑）
        │         └── TransferBUPTask / TransferMovebaseTask / ...
        ├──── SleepTask / RebootRobotTask / ...（直接派生）
        └──── MockXxxTask / Mock 派生（统一通过 BaseTask）
```

---

## 2. 文件布局

| 路径 | 说明 |
|------|------|
| `src/backend/src/tasks/baseTask.ts` | 新增。`BaseTask` 类定义。 |
| `src/backend/src/tasks/index.ts` | 新增 `export { BaseTask } from "./baseTask.js"`。 |
| `src/backend/src/tasks/real/*.ts` | 现有 real 任务，统一改造为 `extends BaseTask` 或经二级基类间接派生。 |
| `src/backend/src/tasks/mock/*.ts` | 现有 mock 任务，统一改造同上。 |
| `src/backend/src/services/taskFlowEngine/taskFlowEngine.ts` | 修改 `Flow.start()` 调用点，注入 `flowId` 与 `flowPhase` 到 per-flow context。 |

---

## 3. BaseTask 类设计

### 3.1 类定义骨架

```ts
import type { ITaskResolver, ValueMap, OptPromise } from "flowed";
import type { Task as FlowedTask } from "flowed";  // 经由公开 d.ts 导出
import type { Logger } from "../logger/index.js";
import { logger as rootLogger } from "../logger/index.js";

const ON_INIT_FALSE_MESSAGE = "onInitialize returned false";
const STANDALONE_FLOW_ID = "<standalone>";
const UNKNOWN_TASK_CODE = "<unknown>";

export abstract class BaseTask implements ITaskResolver {
  public readonly name: string;
  protected log: Logger;

  constructor() {
    this.name = this.constructor.name;
    // 兜底 logger（exec 之外访问也不抛错）
    this.log = rootLogger.child({ name: this.name });
  }

  // 子类生命周期钩子（默认实现）
  protected onInitialize(): OptPromise<boolean> {
    return true;
  }

  protected onExec(_params: ValueMap, _context?: ValueMap): OptPromise<ValueMap> {
    return {};
  }

  protected onDestroy(): OptPromise<void> {
    return;
  }

  // 由 flowed 调用 —— 子类禁止重写
  public async exec(
    params: ValueMap,
    context?: ValueMap,
    task?: FlowedTask
  ): Promise<ValueMap> {
    const ignoreFailure = (params?.ignoreFailure as boolean) === true;
    const flowId = (context?.flowId as string) ?? STANDALONE_FLOW_ID;
    const flowPhase = (context?.flowPhase as "main" | "error") ?? "main";
    const taskCode = task?.code ?? UNKNOWN_TASK_CODE;

    this.log = rootLogger.child({
      flowId,
      flowPhase,
      name: this.name,
      taskCode,
    });

    let failure: Error | undefined;
    let result: ValueMap = {};

    try {
      const initOk = await this.onInitialize();
      if (initOk === false) {
        failure = new Error(ON_INIT_FALSE_MESSAGE);
      } else {
        result = await this.onExec(params, context);
      }
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    }

    try {
      await this.onDestroy();
    } catch (destroyErr) {
      const e = destroyErr instanceof Error ? destroyErr : new Error(String(destroyErr));
      this.log.error({ err: e.message, stack: e.stack }, "onDestroy threw");
      // 不影响最终判定
    }

    if (!failure) {
      return result;
    }

    if (ignoreFailure) {
      this.log.warn(
        { err: failure.message },
        "Task failed (ignored due to ignoreFailure)"
      );
      return {
        done: true,
        success: false,
        ignored: true,
        error: failure.message,
      };
    }

    this.log.error({ err: failure.message, stack: failure.stack }, "Task failed");
    throw failure;
  }
}
```

> 上述代码片段为设计示意，非最终实现。实际实现需根据 `flowed` 类型导出情况调整 `Task` 类型导入方式（必要时使用 `unknown` + 局部断言）。

### 3.2 关键设计决策

#### 3.2.1 生命周期顺序

```
exec()
 │
 ├─ onInitialize() ──────► 抛异常 ─┐
 │      │                          │
 │      └─ false ─────────────────┐│
 │      │                         ││
 │      └─ true                   ││
 │           │                    ││
 ├─ onExec()                      ││
 │      │                         ││
 │      ├─ 返回 ValueMap          ││
 │      │                         ││
 │      └─ 抛异常 ─────────────────┤
 │                                ││
 ├─ onDestroy()  ◄─────────────────┘ (始终执行)
 │      │
 │      └─ 抛异常 → 记 error 日志，不影响判定
 │
 └─ 终判：
       success → return onExec 返回值
       failed  + ignoreFailure=true  → return { done:true, success:false, ignored:true, error }
       failed  + ignoreFailure=false → throw 原异常 / Error('onInitialize returned false')
```

#### 3.2.2 失败标准结果体

```ts
{
  done: true,        // 满足 flowed provides 约定
  success: false,    // 业务上不成功
  ignored: true,     // 区别于子类自行返回的 success: false
  error: <message>,  // 失败原因
}
```

子类自有产出字段（如 `stdout`、`exitCode` 等）不会被合并进来 —— `onExec` 抛异常 ⇒ 没有合法产出 ⇒ 不携带 partial result。需要 partial result 的子类应在 `onExec` 内部 try/catch 后正常返回，不依赖 ignoreFailure。

#### 3.2.3 日志注入

- `BaseTask` 不创建 `createLogger("BaseTask")`，而是直接对 `rootLogger`（`logger` 模块的 root）调用 `.child(...)`，这样 child 字段不会与模块级 `module: "BaseTask"` 混淆。
- 注入字段：

  | 字段 | 来源 |
  |------|------|
  | `flowId` | `context.flowId` 或兜底 `<standalone>` |
  | `flowPhase` | `context.flowPhase` 或兜底 `'main'` |
  | `name` | `this.constructor.name` |
  | `taskCode` | `task.code` 或兜底 `<unknown>` |

- `this.log` 在构造函数中初始化为兜底 child（仅含 `name`），保证子类构造期访问 `this.log` 也安全。

- 在 `exec` 入口重建 `this.log` 时，并发安全性说明：每次 `Flow.start()`，flowed 都会针对每个 task 节点 `new` 一个 resolver 实例；同一实例不会被并发复用（参见 flowed 的 `Task.run()` 调度逻辑）。因此 `this.log` 字段在 `exec` 调用期独占写入，无并发竞争。

#### 3.2.4 不维护任务状态字段

- 任务运行态由 `flowed` 自身（`TaskState`）与 `TaskFlowEngine.taskStates` 维护。
- BaseTask 暂不引入 `status` 枚举字段；如未来需要在 `onDestroy` 中区分"是否成功"，再以方法参数形式传入（如 `onDestroy(success: boolean)`），属于后续扩展。

---

## 4. TaskFlowEngine 配套修改

### 4.1 修改 `Flow.start()` 调用点

**位置**：`src/backend/src/services/taskFlowEngine/taskFlowEngine.ts` 第 333 行 与 第 434 行。

**修改前**：

```ts
.start(startParams, expected, resolvers, this.flowContext, { instanceId: id })
```

**修改后**：

```ts
.start(
  startParams,
  expected,
  resolvers,
  { ...this.flowContext, flowId: id, flowPhase: "main" },
  { instanceId: id }
)
```

异常 DAG 的启动同样修改，注入 `flowPhase: "error"`：

```ts
.start(
  inputWithError,
  expected,
  resolvers,
  { ...this.flowContext, flowId: id, flowPhase: "error" },
  { instanceId: id }
)
```

**关键约束**：必须使用对象展开（`{ ...this.flowContext, flowId, flowPhase }`）构造**新对象**传入 `Flow.start()`，**严禁**直接 `this.flowContext.flowId = id`。原因：`this.flowContext` 是引擎级共享对象（由 `setFlowContext()` 设置），多个 flow 并发执行时直接写回会相互覆盖。

### 4.2 公开 API 不变

`TaskFlowEngine.setFlowContext(context: ValueMap)` 的对外契约不变；`flowId` / `flowPhase` 字段由引擎内部注入，调用方传入的同名字段（若有）将被引擎覆盖。

---

## 5. 子任务迁移规范

### 5.1 直接派生型（无中间基类）

**改造前**：

```ts
export class SleepTask implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    const sleepMs = (params.sleepMs as number) ?? 0;
    log.info({ sleepMs }, "Sleeping");
    await new Promise((r) => setTimeout(r, sleepMs));
    return { done: true, success: true };
  }
}
```

**改造后**：

```ts
export class SleepTask extends BaseTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const sleepMs = (params.sleepMs as number) ?? 0;
    this.log.info({ sleepMs }, "Sleeping");
    await new Promise((r) => setTimeout(r, sleepMs));
    return { done: true, success: true };
  }
}
```

**要点**：

- 移除文件顶部的 `const log = createLogger("Sleep");`，改用 `this.log`。
- `implements ITaskResolver` → `extends BaseTask`。
- `exec` → `protected override onExec`，方法体保持原逻辑。
- 不再读取 / 处理 `params.ignoreFailure`。

### 5.2 二级基类（SshCommandTask / SshFileTransferTask）

**`SshCommandTask` 改造方案**：

```ts
export class SshCommandTask extends BaseTask {
  protected getSshCommand(_params: ValueMap): string { ... }
  protected buildParams(params: ValueMap): SshCommandParams { ... }   // 移除 ignoreFailure 字段

  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    // 原 exec 主体（含 retry 循环）整体迁入
    // 移除：
    //   - 所有 if (ignoreFailure) { return ... } 分支
    //   - 失败累积器中的 ignoreFailure 处理
    // 仅保留：
    //   - 重试循环
    //   - exit code != 0 时直接 throw（原 throw 不变）
    //   - 重试耗尽时 throw lastError（原 throw 不变）
  }
}
```

`SshCommandParams` 接口移除 `ignoreFailure` 字段。`buildParams` 不再读取 `params.ignoreFailure`。失败的吞抛由 BaseTask 接管。

**`SshFileTransferTask` 同理**：移除内部 `ignoreFailure` 分支，让异常自然抛出。

**`sshConnectionWait` / `WaitSshReconnectTask`（等待型任务）特殊处理**：

这些任务存在已有的 soft-failure 返回路径（超时时显式 return `{ done:true, success:false, state, attempts, elapsedMs, error }`），其 partial result 字段（`state` / `attempts` / `elapsedMs`）被现有 DAG 与测试用例（`task_flow_engine_test_cases.md` TC-TFE-053）消费。本次重构 **不强制** 将其迁移为"统一抛异常 + BaseTask 转义"模式：

- 这类任务可继续在内部读取 `params.ignoreFailure`，并据此决定走"抛异常"或"soft-failure 返回"两条路径。
- 但若它们已经选择 soft-failure 返回路径（不抛异常），BaseTask 不会感知失败，也不会做转义；返回体由子类完全自定义。
- 若它们选择抛异常路径，则按 SshCommandTask 同款流程被 BaseTask 接管；此时不得在 `onExec` 内自己再做 `ignoreFailure` 包装（避免双重转义）。

简言之：**对同一异常对象只做一次 ignoreFailure 转义**。要么子类自己 try/catch 转 soft-failure（BaseTask 不介入），要么子类抛异常给 BaseTask 转义（子类不读 ignoreFailure）。两种模式不可叠加。

**重要：retry 行为变化**

- **改造前**：`ignoreFailure=true` + 重试耗尽 → 子类返回 `{ done:true, success:false, stdout:"", stderr:err.message, exitCode:null }`（携带空 stdout/null exitCode）。
- **改造后**：`ignoreFailure=true` + 重试耗尽 → 抛异常 → BaseTask 捕获 → 返回 `{ done:true, success:false, ignored:true, error:err.message }`（不再携带 `stdout` / `stderr` / `exitCode`）。

此变化属于 FR-BT-004 的有意约定（不保留 partial result）。需 DAG / 下游消费者评估影响：当前代码搜索结果显示，`ignoreFailure` 路径下读取 `stdout` / `exitCode` 的下游任务 = 0 个，故影响可控。**实施时需在 PR 描述中明确该行为变更**，并由代码评审环节确认无遗漏。

### 5.3 三级派生（如 `UpgradeBUPTask extends SshCommandTask`）

无需直接修改：随二级基类自动适配。仅需检查重写的方法（如 `getSshCommand`、`buildParams`）不要错误地 override `exec` / `onExec` 之外的方法。

### 5.4 Mock 任务

**独立 Mock**（如 `MockSshCommandTask` 自己 `implements ITaskResolver`）：

```ts
// 改造前
export class MockSshCommandTask implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> { ... }
}

// 改造后
export class MockSshCommandTask extends BaseTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> { ... }
}
```

**继承真实任务的 Mock**（如 `MockUpdateRobotBasicInfoTask extends UpdateRobotBasicInfoTask`）：

```ts
// 改造前
export class MockUpdateRobotBasicInfoTask extends UpdateRobotBasicInfoTask {
  override async exec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    if (someCondition) return { done: true, success: true };
    return super.exec(params, context);
  }
}

// 改造后
export class MockUpdateRobotBasicInfoTask extends UpdateRobotBasicInfoTask {
  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    if (someCondition) return { done: true, success: true };
    return super.onExec(params, context);
  }
}
```

**禁止**：mock override `exec`，否则会跳过 BaseTask 的生命周期管理与日志注入。

---

## 6. 与现有模块的关系

| 模块 | 关系 | 说明 |
|------|------|------|
| `logger/index.ts` | 依赖 | BaseTask 使用 `logger`（root proxy）的 `.child()` 方法注入字段。无需修改 logger 模块。 |
| `taskFlowEngine/taskFlowEngine.ts` | 依赖 + 修改 | 在 `Flow.start()` 调用点注入 `flowId` 与 `flowPhase`。 |
| `taskFlowEngine/resolverRegistry.ts` | 无变动 | 注册方仍然是 `TaskResolverClass`；`BaseTask` 是 abstract 类，不直接注册，注册的是其派生类。 |
| `tasks/index.ts` | 修改 | 新增 `export { BaseTask } from "./baseTask.js"`。其余导出保持。 |
| `flowed` | 依赖（接口） | 不升级、不替换；仍使用其 `ITaskResolver` 与 `ValueMap` 类型。 |

---

## 7. 错误处理设计

| 场景 | BaseTask 行为 |
|------|---------------|
| `onInitialize` 返回 `false` | 不调用 `onExec`；调用 `onDestroy`；终判失败；`error = 'onInitialize returned false'`。 |
| `onInitialize` 抛异常 | 不调用 `onExec`；调用 `onDestroy`；终判失败；`error = err.message`。 |
| `onExec` 抛异常 | 调用 `onDestroy`；终判失败；`error = err.message`。 |
| `onDestroy` 抛异常 | 仅记 error 日志（含 stack）；不影响最终判定。 |
| 终判失败 + `ignoreFailure=true` | 不向上抛；返回标准化失败结果体；记 warn 日志。 |
| 终判失败 + `ignoreFailure=false` | 向上抛原异常 / `Error('onInitialize returned false')`；记 error 日志（含 stack）。 |
| 终判成功 | 原样返回 `onExec` 的结果，无附加字段。 |
| `context` 缺失 | `flowId` 取 `<standalone>`，`flowPhase` 取 `main`，照常执行。 |
| `task` 参数缺失 | `taskCode` 取 `<unknown>`，照常执行。 |

---

## 8. 类型定义补充

### 8.1 BaseTask 公开字段

| 字段 | 可见性 | 类型 | 说明 |
|------|--------|------|------|
| `name` | `public readonly` | `string` | 实现类名（`this.constructor.name`）。 |
| `log` | `protected` | `Logger` | pino child logger，含 `flowId / name / taskCode / flowPhase` 字段。 |

### 8.2 BaseTask 受保护方法

| 方法 | 可见性 | 签名 | 默认行为 |
|------|--------|------|---------|
| `onInitialize` | `protected` | `() => OptPromise<boolean>` | 返回 `true`。 |
| `onExec` | `protected` | `(params: ValueMap, context?: ValueMap) => OptPromise<ValueMap>` | 返回 `{}`。 |
| `onDestroy` | `protected` | `() => OptPromise<void>` | 空操作。 |

### 8.3 BaseTask 公开方法

| 方法 | 可见性 | 签名 | 说明 |
|------|--------|------|------|
| `exec` | `public` | `(params, context?, task?) => Promise<ValueMap>` | 由 `flowed` 调用。子类 **不应** 重写。 |

---

## 9. 实施步骤建议

1. 新增 `BaseTask` 类与单元测试。
2. 修改 `TaskFlowEngine.startFlowInstance()` / `runErrorDag()` 中的 `Flow.start()` 调用，注入 `flowId` 与 `flowPhase`。补/改任务流引擎层面的测试。
3. 迁移直接派生型 real 任务（`SleepTask`、`MatchFileContentTask`、`UpdateRobotBasicInfoTask` 等约 10 个）。
4. 迁移二级基类 `SshCommandTask`、`SshFileTransferTask`、`sshConnectionWait`、`WaitSshReconnectTask`。
5. 迁移 mock 任务（约 18 个）。
6. 全量回归 `src/backend/src/test.ts`，确认所有现有用例通过。
7. 更新 `documents/design/backend_task_design.md` 顶部的总览段落，引用 BaseTask 设计文档。

---

## 10. 兼容性与回退

- **DAG 输入兼容**：所有现有 DAG 中 `ignoreFailure` 字段语义保持不变，使用方无感。
- **provides 字段兼容**：成功路径下任务自有的 `done` / `success` / 业务字段保持不变；ignoreFailure 失败路径下，去掉 `stdout` / `stderr` / `exitCode`（详见 5.2 的变化说明）。
- **回退策略**：BaseTask 引入若发现重大问题，可逐文件回退到 `implements ITaskResolver` 实现，无锁定式依赖。`TaskFlowEngine` 注入 `flowId` 的修改是非破坏性的（即使没有任何任务读取 `context.flowId` 也无影响）。
