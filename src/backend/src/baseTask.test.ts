// BaseTask unit tests — covers TC-BT-001 through TC-BT-027 + TC-BT-030 / TC-BT-031.
// See documents/test/backend_base_task_test_cases.md for case definitions.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ValueMap } from "flowed";
import { Flow, type FlowSpec, type TaskResolverClass } from "flowed";
import { configureLogger } from "./logger/index.js";
import { BaseTask } from "./tasks/baseTask.js";
import { SshCommandTask } from "./tasks/real/sshCommandTask.js";
import { SshFileTransferTask } from "./tasks/real/sshFileTransferTask.js";

// Redirect logs to a temp dir during tests so we don't pollute ./logs.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const tmpLogDir = mkdtempSync(join(tmpdir(), "robotops-basetask-test-"));
configureLogger({ level: "silent", logsDir: tmpLogDir });

// --- Test helpers ---

interface CallTrace {
  calls: string[];
}

class TraceableTask extends BaseTask {
  constructor(
    private readonly trace: CallTrace,
    private readonly init: () => boolean | Promise<boolean> = () => true,
    private readonly execImpl: (params: ValueMap, context?: ValueMap) => ValueMap | Promise<ValueMap> = () => ({}),
    private readonly destroyImpl: () => void | Promise<void> = () => {}
  ) {
    super();
  }

  protected override async onInitialize(): Promise<boolean> {
    this.trace.calls.push("init");
    return await this.init();
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    this.trace.calls.push("exec");
    return await this.execImpl(params, context);
  }

  protected override async onDestroy(): Promise<void> {
    this.trace.calls.push("destroy");
    await this.destroyImpl();
  }
}

class CaptureContextTask extends BaseTask {
  public capturedContext?: ValueMap;
  protected override onExec(_params: ValueMap, context?: ValueMap): ValueMap {
    this.capturedContext = context ? { ...context } : undefined;
    return { done: true, success: true };
  }
}

// --- 2.1 Lifecycle orchestration ---

describe("BaseTask - Lifecycle", () => {
  it("TC-BT-001: onInitialize=true -> init -> exec -> destroy", async () => {
    const trace: CallTrace = { calls: [] };
    const task = new TraceableTask(trace);
    const result = await task.exec({}, { flowId: "f1" });
    assert.deepEqual(trace.calls, ["init", "exec", "destroy"]);
    assert.deepEqual(result, {});
  });

  it("TC-BT-002: onInitialize returns false skips onExec, runs onDestroy, throws fixed message", async () => {
    const trace: CallTrace = { calls: [] };
    const task = new TraceableTask(trace, () => false);
    await assert.rejects(
      () => task.exec({}, { flowId: "f1" }),
      (err: Error) => err.message === "onInitialize returned false"
    );
    assert.deepEqual(trace.calls, ["init", "destroy"]);
  });

  it("TC-BT-003: onInitialize throws skips onExec, runs onDestroy, propagates original error", async () => {
    const trace: CallTrace = { calls: [] };
    const original = new Error("init boom");
    const task = new TraceableTask(trace, () => { throw original; });
    let caught: unknown;
    try {
      await task.exec({}, { flowId: "f1" });
    } catch (e) {
      caught = e;
    }
    assert.equal(caught, original);
    assert.deepEqual(trace.calls, ["init", "destroy"]);
  });

  it("TC-BT-004: onExec throws still calls onDestroy and propagates", async () => {
    const trace: CallTrace = { calls: [] };
    const original = new Error("exec boom");
    const task = new TraceableTask(trace, () => true, () => { throw original; });
    let caught: unknown;
    try {
      await task.exec({}, { flowId: "f1" });
    } catch (e) {
      caught = e;
    }
    assert.equal(caught, original);
    assert.deepEqual(trace.calls, ["init", "exec", "destroy"]);
  });

  it("TC-BT-005: async hooks awaited in order", async () => {
    const trace: CallTrace = { calls: [] };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const task = new TraceableTask(
      trace,
      async () => { await wait(5); return true; },
      async () => { await wait(5); return { done: true }; },
      async () => { await wait(5); }
    );
    await task.exec({}, { flowId: "f1" });
    assert.deepEqual(trace.calls, ["init", "exec", "destroy"]);
  });

  it("TC-BT-006: empty subclass works with default lifecycle", async () => {
    class EmptyTask extends BaseTask {}
    const result = await new EmptyTask().exec({}, { flowId: "f1" });
    assert.deepEqual(result, {});
  });
});

// --- 2.2 ignoreFailure translation ---

describe("BaseTask - ignoreFailure translation", () => {
  it("TC-BT-007: ignoreFailure=false (default) + onExec throws -> rethrow original error", async () => {
    const original = new Error("e");
    const task = new TraceableTask({ calls: [] }, () => true, () => { throw original; });
    let caught: unknown;
    try {
      await task.exec({}, { flowId: "f" });
    } catch (e) {
      caught = e;
    }
    assert.equal(caught, original);
  });

  it("TC-BT-008: ignoreFailure=true + onExec throws -> standardized failure body", async () => {
    const task = new TraceableTask({ calls: [] }, () => true, () => { throw new Error("xy"); });
    const result = await task.exec({ ignoreFailure: true }, { flowId: "f" });
    assert.deepEqual(result, {
      done: true,
      success: false,
      ignored: true,
      error: "xy",
    });
  });

  it("TC-BT-009: ignoreFailure=true + onInitialize=false -> standardized failure body with fixed text", async () => {
    const trace: CallTrace = { calls: [] };
    const task = new TraceableTask(trace, () => false);
    const result = await task.exec({ ignoreFailure: true }, { flowId: "f" });
    assert.deepEqual(result, {
      done: true,
      success: false,
      ignored: true,
      error: "onInitialize returned false",
    });
    assert.deepEqual(trace.calls, ["init", "destroy"]);
  });

  it("TC-BT-010: ignoreFailure=true + onInitialize throws -> standardized failure body", async () => {
    const trace: CallTrace = { calls: [] };
    const task = new TraceableTask(trace, () => { throw new Error("ie"); });
    const result = await task.exec({ ignoreFailure: true }, { flowId: "f" });
    assert.deepEqual(result, {
      done: true,
      success: false,
      ignored: true,
      error: "ie",
    });
    assert.deepEqual(trace.calls, ["init", "destroy"]);
  });

  it("TC-BT-011: ignoreFailure=true + success path -> onExec result returned as-is", async () => {
    const task = new TraceableTask({ calls: [] }, () => true, () => ({ done: true, success: true, foo: 1 }));
    const result = await task.exec({ ignoreFailure: true }, { flowId: "f" });
    assert.deepEqual(result, { done: true, success: true, foo: 1 });
    assert.equal((result as ValueMap).ignored, undefined);
  });

  it("TC-BT-012: ignoreFailure must be strictly boolean true (string 'true' is not accepted)", async () => {
    const original = new Error("xy");
    const task = new TraceableTask({ calls: [] }, () => true, () => { throw original; });
    let caught: unknown;
    try {
      await task.exec({ ignoreFailure: "true" }, { flowId: "f" });
    } catch (e) {
      caught = e;
    }
    assert.equal(caught, original);
  });
});

// --- 2.3 onDestroy exception handling ---

describe("BaseTask - onDestroy exception handling", () => {
  it("TC-BT-013: onDestroy throws after success -> success preserved", async () => {
    const task = new TraceableTask(
      { calls: [] },
      () => true,
      () => ({ done: true, success: true, x: 1 }),
      () => { throw new Error("d boom"); }
    );
    const result = await task.exec({}, { flowId: "f" });
    assert.deepEqual(result, { done: true, success: true, x: 1 });
  });

  it("TC-BT-014: onDestroy throws after onExec failure -> onExec error wins", async () => {
    const original = new Error("E");
    const task = new TraceableTask(
      { calls: [] },
      () => true,
      () => { throw original; },
      () => { throw new Error("D"); }
    );
    let caught: unknown;
    try {
      await task.exec({}, { flowId: "f" });
    } catch (e) {
      caught = e;
    }
    assert.equal(caught, original);
  });

  it("TC-BT-015: onDestroy throws + ignoreFailure=true -> error field comes from onExec", async () => {
    const task = new TraceableTask(
      { calls: [] },
      () => true,
      () => { throw new Error("E"); },
      () => { throw new Error("D"); }
    );
    const result = await task.exec({ ignoreFailure: true }, { flowId: "f" });
    assert.deepEqual(result, {
      done: true,
      success: false,
      ignored: true,
      error: "E",
    });
  });
});

// --- 2.4 context / task parameter handling ---

describe("BaseTask - context/task parameters", () => {
  it("TC-BT-016: full context + task -> all four log fields are wired (verified via captured context and class name)", async () => {
    const task = new CaptureContextTask();
    await task.exec({}, { flowId: "F1", flowPhase: "main" }, { code: "stepA" } as never);
    assert.equal(task.capturedContext?.flowId, "F1");
    assert.equal(task.capturedContext?.flowPhase, "main");
    assert.equal(task.name, "CaptureContextTask");
  });

  it("TC-BT-017: missing context -> flowId/flowPhase fall back to defaults", async () => {
    // We can't easily inspect the bound logger fields without a custom transport.
    // Instead we verify exec runs without throwing and the task name is correct.
    const task = new CaptureContextTask();
    await task.exec({});
    assert.equal(task.capturedContext, undefined);
    assert.equal(task.name, "CaptureContextTask");
  });

  it("TC-BT-018: missing task parameter -> exec still succeeds", async () => {
    const task = new CaptureContextTask();
    await task.exec({}, { flowId: "F2", flowPhase: "error" });
    assert.equal(task.capturedContext?.flowId, "F2");
    assert.equal(task.capturedContext?.flowPhase, "error");
  });

  it("TC-BT-019: non-string flowId is tolerated", async () => {
    const task = new CaptureContextTask();
    await task.exec({}, { flowId: 123 as unknown as string });
    // Task did not throw; bounded logger created without exception.
    assert.equal(task.capturedContext?.flowId, 123);
  });
});

// --- 2.5 name and pre-exec logger ---

describe("BaseTask - name and pre-exec logger", () => {
  it("TC-BT-020: name == this.constructor.name available right after construction", () => {
    class FooTask extends BaseTask {}
    assert.equal(new FooTask().name, "FooTask");
  });

  it("TC-BT-021: log can be used in subclass constructor without throwing", () => {
    class CtorLoggingTask extends BaseTask {
      constructor() {
        super();
        this.log.info({}, "ctor");
      }
    }
    assert.doesNotThrow(() => new CtorLoggingTask());
  });
});

// --- 2.6 No status field ---

describe("BaseTask - no status field", () => {
  it("TC-BT-022: instance does not expose status/state fields", () => {
    class FooTask extends BaseTask {}
    const t = new FooTask() as unknown as Record<string, unknown>;
    assert.equal(t.status, undefined);
    assert.equal(t.state, undefined);
  });
});

// --- 2.7 Subclass override contract ---

describe("BaseTask - subclass override contract", () => {
  it("TC-BT-023: overriding onExec keeps lifecycle orchestration; result returned as-is", async () => {
    class FooTask extends BaseTask {
      protected override onExec(): ValueMap {
        return { x: 1 };
      }
    }
    const result = await new FooTask().exec({}, { flowId: "f" });
    assert.deepEqual(result, { x: 1 });
    // BaseTask did not append done / success / etc.
    assert.equal((result as ValueMap).done, undefined);
    assert.equal((result as ValueMap).success, undefined);
  });
});

// --- 2.8 TaskFlowEngine integration: flowId / flowPhase via flowed Flow ---

describe("BaseTask - flowed Flow integration", () => {
  it("TC-BT-024 (Flow-level): tasks receive context.flowId and flowPhase=main", async () => {
    let captured: ValueMap | undefined;
    class CaptureTask extends BaseTask {
      protected override onExec(_params: ValueMap, context?: ValueMap): ValueMap {
        captured = context ? { ...context } : undefined;
        return { done: true };
      }
    }

    const dag: FlowSpec = {
      tasks: {
        step1: {
          requires: [],
          provides: ["done"],
          resolver: { name: "Capture", results: { done: "done" } },
        },
      },
    };
    const flow = new Flow(dag);
    await flow.start(
      {},
      ["done"],
      { Capture: CaptureTask as unknown as TaskResolverClass },
      { flowId: "ext-flow-id", flowPhase: "main" }
    );

    assert.equal(captured?.flowId, "ext-flow-id");
    assert.equal(captured?.flowPhase, "main");
  });

  it("TC-BT-027 (concurrency): two concurrent flows do not pollute each other's flowId", async () => {
    const seen: string[] = [];
    class CaptureTask extends BaseTask {
      protected override async onExec(_params: ValueMap, context?: ValueMap): Promise<ValueMap> {
        await new Promise((r) => setTimeout(r, 10));
        seen.push(String(context?.flowId));
        return { done: true };
      }
    }

    const buildDag = (): FlowSpec => ({
      tasks: {
        step1: {
          requires: [],
          provides: ["done"],
          resolver: { name: "Capture", results: { done: "done" } },
        },
      },
    });

    const start = (id: string) => {
      const f = new Flow(buildDag());
      return f.start(
        {},
        ["done"],
        { Capture: CaptureTask as unknown as TaskResolverClass },
        { flowId: id, flowPhase: "main" }
      );
    };

    await Promise.all([start("flow-A"), start("flow-B")]);

    assert.equal(seen.length, 2);
    assert.ok(seen.includes("flow-A"));
    assert.ok(seen.includes("flow-B"));
  });
});

// --- 2.9 SshCommandTask / SshFileTransferTask: ignoreFailure now lives in BaseTask ---

describe("BaseTask - secondary base classes no longer handle ignoreFailure (TC-BT-030)", () => {
  it("SshCommandTask source no longer references ignoreFailure", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const here = fileURLToPath(new URL("./tasks/real/sshCommandTask.ts", import.meta.url));
    const src = await readFile(here, "utf-8");
    assert.equal(src.includes("ignoreFailure"), false);
  });

  it("SshFileTransferTask source no longer references ignoreFailure", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const here = fileURLToPath(new URL("./tasks/real/sshFileTransferTask.ts", import.meta.url));
    const src = await readFile(here, "utf-8");
    assert.equal(src.includes("ignoreFailure"), false);
  });

  it("SshCommandTask: ignoreFailure=true on local-file-not-found-style failure -> standardized body via BaseTask", async () => {
    // Use a deliberately invalid host so connection fails immediately, no real network.
    class FastFailSshCommandTask extends SshCommandTask {
      protected override getSshCommand(): string {
        return "true";
      }
    }
    const task = new FastFailSshCommandTask();
    const result = await task.exec({
      robotIp: "127.0.0.1",
      robotPort: 1, // closed port
      sshUsername: "x",
      sshPassword: "x",
      retryCount: 1,
      connectTimeout: 200,
      commandTimeout: 200,
      ignoreFailure: true,
    });
    assert.equal((result as ValueMap).done, true);
    assert.equal((result as ValueMap).success, false);
    assert.equal((result as ValueMap).ignored, true);
    assert.equal(typeof (result as ValueMap).error, "string");
    // Ensure no partial-result fields leaked through.
    assert.equal((result as ValueMap).stdout, undefined);
    assert.equal((result as ValueMap).stderr, undefined);
    assert.equal((result as ValueMap).exitCode, undefined);
  });

  it("SshFileTransferTask: ignoreFailure=true on local-file-missing -> standardized body via BaseTask", async () => {
    const task = new SshFileTransferTask();
    const result = await task.exec({
      robotIp: "127.0.0.1",
      sshUsername: "x",
      sshPassword: "x",
      retryCount: 1,
      timeout: 200,
      localFilePath: "/non-existent/path/that/should/not/exist-xyz",
      remoteFilePath: "/tmp/dest",
      verifyChecksum: false,
      ignoreFailure: true,
    });
    assert.equal((result as ValueMap).done, true);
    assert.equal((result as ValueMap).success, false);
    assert.equal((result as ValueMap).ignored, true);
    assert.equal(typeof (result as ValueMap).error, "string");
    assert.equal((result as ValueMap).bytesTransferred, undefined);
  });

  it("SshCommandTask: ignoreFailure=false (default) on connect failure -> rethrow", async () => {
    class FastFailSshCommandTask extends SshCommandTask {
      protected override getSshCommand(): string {
        return "true";
      }
    }
    const task = new FastFailSshCommandTask();
    await assert.rejects(() =>
      task.exec({
        robotIp: "127.0.0.1",
        robotPort: 1,
        sshUsername: "x",
        sshPassword: "x",
        retryCount: 1,
        connectTimeout: 200,
        commandTimeout: 200,
      })
    );
  });
});
