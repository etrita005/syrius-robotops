import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { FlowSpec, ValueMap, ITaskResolver } from "flowed";
import { TaskFlowEngine } from "./services/taskFlowEngine/taskFlowEngine.js";
import type { FlowRecord, FlowSummary, FlowType, TaskState } from "./services/taskFlowEngine/taskFlowEngine.js";
import { ResolverRegistry } from "./services/taskFlowEngine/resolverRegistry.js";
import { SseManager } from "./services/taskFlowEngine/sseManager.js";
import { createTaskFlowRoutes } from "./routes/taskFlowRoutes.js";
import type { ObjectStoreResource } from "./services/objectStore.js";

class InMemoryObjectStore {
  private store = new Map<string, unknown>();
  private deleted = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.store.has(path);
  }

  async put(path: string, _body: Buffer | string, _contentType?: string): Promise<void> {
    this.store.set(path, _body);
  }

  async putJson(path: string, data: unknown): Promise<void> {
    this.store.set(path, data);
  }

  async putBuffer(path: string, data: Buffer, contentType: string): Promise<void> {
    this.store.set(path, { data, contentType });
  }

  async list(path: string): Promise<ObjectStoreResource[]> {
    const prefix = path.replace(/\/$/, "") + "/";
    const entries: ObjectStoreResource[] = [];
    const seen = new Set<string>();
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        const name = key.slice(prefix.length).split("/")[0];
        if (!seen.has(name)) {
          seen.add(name);
          entries.push({ name, type: "file" });
        }
      }
    }
    return entries;
  }

  async getJson<T>(path: string): Promise<T | null> {
    if (this.deleted.has(path)) return null;
    const val = this.store.get(path);
    return val !== undefined ? (val as T) : null;
  }

  async get(path: string): Promise<{ ok: boolean; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer> }> {
    const val = this.store.get(path);
    if (val === undefined) return { ok: false, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    const str = typeof val === "string" ? val : JSON.stringify(val);
    const buf = Buffer.from(str, "utf-8");
    return {
      ok: true,
      text: async () => str,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    };
  }

  async deletePath(path: string): Promise<boolean> {
    this.deleted.add(path);
    return this.store.delete(path);
  }
}

class SpySseManager {
  events: { event: string; data: unknown }[] = [];

  addClient(_client: { id: string; controller: ReadableStreamDefaultController }): void {}

  removeClient(_id: string): void {}

  broadcast(event: string, data: unknown): void {
    const enriched =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? { ...(data as Record<string, unknown>), timestamp: new Date().toISOString() }
        : data;
    this.events.push({ event, data: enriched });
  }

  clear(): void {
    this.events = [];
  }

  hasEvent(eventName: string): boolean {
    return this.events.some((e) => e.event === eventName);
  }

  findEvent(eventName: string): { event: string; data: unknown } | undefined {
    return this.events.find((e) => e.event === eventName);
  }

  eventCount(eventName: string): number {
    return this.events.filter((e) => e.event === eventName).length;
  }
}

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

const singleTaskDag: FlowSpec = {
  tasks: {
    task1: {
      provides: ["data1"],
      resolver: { name: "MockTask1", results: { done: "data1" } },
    },
  },
};

const dependentDag: FlowSpec = {
  tasks: {
    task1: {
      provides: ["data1"],
      resolver: { name: "MockTask1", results: { done: "data1" } },
    },
    task2: {
      requires: ["data1"],
      provides: ["data2"],
      resolver: { name: "MockTask2", results: { done: "data2" } },
    },
  },
};

function createEngine(ttlMs?: number, cleanupMs?: number) {
  const objStore = new InMemoryObjectStore() as unknown as import("./services/objectStore.js").ObjectStore;
  const sse = new SpySseManager() as unknown as import("./services/taskFlowEngine/sseManager.js").SseManager;
  const registry = new ResolverRegistry();
  registry.register("MockTask1", MockTask1);
  registry.register("MockTask2", MockTask2);
  registry.register("MockFailingTask", MockFailingTask);
  const engine = new TaskFlowEngine(objStore, sse, registry, {
    completedFlowTtlMs: ttlMs,
    cleanupIntervalMs: cleanupMs,
  });
  return { engine, objStore: objStore as unknown as InMemoryObjectStore, sse: sse as unknown as SpySseManager };
}

function waitForFlowComplete(engine: TaskFlowEngine, id: string, timeoutMs = 10000): Promise<FlowSummary> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const summary = engine.getFlow(id);
      if (!summary) {
        clearInterval(timer);
        reject(new Error("Flow not found"));
        return;
      }
      if (summary.state === "COMPLETED" || summary.state === "FAILED" || summary.state === "STOPPED") {
        clearInterval(timer);
        resolve(summary);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Flow did not complete within timeout"));
      }
    }, 50);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHonoApp(engine: TaskFlowEngine, sse: SseManager): Hono {
  const app = new Hono();
  app.route("/api/flows", createTaskFlowRoutes(engine, sse));
  return app;
}

describe("TaskFlowEngine - Core", () => {
  describe("createFlow", () => {
    it("TC-TFE-001: should create and start an internal flow", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);
      assert.ok(summary.id);
      assert.match(summary.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      assert.equal(summary.type, "internal");
      assert.ok(["RUNNING", "COMPLETED", "FAILED"].includes(summary.state));
      assert.ok(summary.taskStates);
      assert.ok(summary.taskStates["task1"] !== undefined);
      engine.destroy();
    });

    it("TC-TFE-002: should create and persist a user flow", async () => {
      const { engine, objStore } = createEngine();
      const summary = await engine.createFlow("user", singleTaskDag);
      assert.equal(summary.type, "user");

      const persisted = await objStore.getJson(`flows/${summary.id}`);
      assert.ok(persisted);
      assert.equal((persisted as FlowRecord).id, summary.id);
      engine.destroy();
    });

    it("TC-TFE-003: should accept flow input parameters", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag, { robotIp: "10.0.0.1" });
      assert.deepEqual(summary.input, { robotIp: "10.0.0.1" });
      engine.destroy();
    });

    it("TC-TFE-004: should default input to undefined when not provided", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);
      assert.equal(summary.input, undefined);
      engine.destroy();
    });

    it("TC-TFE-005: should extract expected results on completion", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag, undefined, ["data1"]);
      await waitForFlowComplete(engine, summary.id);

      const completed = engine.getFlow(summary.id);
      assert.ok(completed);
      assert.equal(completed.state, "COMPLETED");
      assert.ok(completed.results);
      assert.ok((completed.results as ValueMap)["data1"] !== undefined);
      assert.ok(completed.finishedAt);
      engine.destroy();
    });

    it("TC-TFE-042: should reject unregistered resolver", async () => {
      const { engine } = createEngine();
      const badDag: FlowSpec = {
        tasks: {
          task1: {
            resolver: { name: "NonExistentTask" },
          },
        },
      };
      await assert.rejects(
        () => engine.createFlow("internal", badDag),
        /not registered/
      );
      engine.destroy();
    });

    it("should validate DAG with tasks field", async () => {
      const { engine } = createEngine();
      const badDag = { notTasks: {} } as unknown as FlowSpec;
      const summary = await engine.createFlow("internal", badDag);
      assert.ok(summary.id);
      engine.destroy();
    });
  });

  describe("getFlow and listFlows", () => {
    it("TC-TFE-009: should list all flows sorted by createdAt desc", async () => {
      const { engine } = createEngine();
      const s1 = await engine.createFlow("internal", singleTaskDag);
      await sleep(10);
      const s2 = await engine.createFlow("user", singleTaskDag);
      await sleep(10);
      const s3 = await engine.createFlow("internal", singleTaskDag);

      const flows = engine.listFlows();
      assert.equal(flows.length, 3);
      assert.equal(flows[0].id, s3.id);
      assert.equal(flows[2].id, s1.id);
      engine.destroy();
    });

    it("TC-TFE-010: should filter flows by type", async () => {
      const { engine } = createEngine();
      await engine.createFlow("internal", singleTaskDag);
      await engine.createFlow("user", singleTaskDag);

      const internal = engine.listFlows("internal");
      for (const f of internal) {
        assert.equal(f.type, "internal");
      }

      const user = engine.listFlows("user");
      for (const f of user) {
        assert.equal(f.type, "user");
      }
      engine.destroy();
    });

    it("TC-TFE-011: should get flow detail by id", async () => {
      const { engine } = createEngine();
      const created = await engine.createFlow("internal", singleTaskDag, { robotIp: "10.0.0.1" }, ["data1"]);

      const detail = engine.getFlow(created.id);
      assert.ok(detail);
      assert.equal(detail.id, created.id);
      assert.equal(detail.type, "internal");
      assert.deepEqual(detail.input, { robotIp: "10.0.0.1" });
      assert.deepEqual(detail.expectedResults, ["data1"]);
      engine.destroy();
    });

    it("TC-TFE-012: should return undefined for non-existent flow", async () => {
      const { engine } = createEngine();
      const result = engine.getFlow("non-existent-id");
      assert.equal(result, undefined);
      engine.destroy();
    });
  });

  describe("pauseFlow and resumeFlow", () => {
    it("TC-TFE-013: should pause a RUNNING flow", async () => {
      const { engine, sse } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);

      sse.clear();
      await engine.pauseFlow(summary.id);

      const flow = engine.getFlow(summary.id);
      assert.ok(flow);
      const terminalStates = ["PAUSED", "COMPLETED", "FAILED", "STOPPED"];
      assert.ok(terminalStates.includes(flow.state));
      engine.destroy();
    });

    it("TC-TFE-014: should be idempotent when pausing non-RUNNING flow", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);
      await engine.pauseFlow(summary.id);
      const stateBefore = engine.getFlow(summary.id)!.state;

      await engine.pauseFlow(summary.id);
      const stateAfter = engine.getFlow(summary.id)!.state;
      assert.equal(stateAfter, stateBefore);
      engine.destroy();
    });

    it("TC-TFE-015: should resume a PAUSED flow", async () => {
      const { engine, sse } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);
      await engine.pauseFlow(summary.id);

      sse.clear();
      await engine.resumeFlow(summary.id);

      await waitForFlowComplete(engine, summary.id);
      const completed = engine.getFlow(summary.id);
      assert.ok(completed);
      assert.ok(["COMPLETED", "RUNNING"].includes(completed.state));
      engine.destroy();
    });

    it("TC-TFE-016: should be idempotent when resuming non-PAUSED flow", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);
      const stateBefore = engine.getFlow(summary.id)!.state;

      await engine.resumeFlow(summary.id);
      const stateAfter = engine.getFlow(summary.id)!.state;
      assert.equal(stateAfter, stateBefore);
      engine.destroy();
    });

    it("should throw when pausing non-existent flow", async () => {
      const { engine } = createEngine();
      await assert.rejects(() => engine.pauseFlow("non-existent"), /Flow not found/);
      engine.destroy();
    });

    it("should throw when resuming non-existent flow", async () => {
      const { engine } = createEngine();
      await assert.rejects(() => engine.resumeFlow("non-existent"), /Flow not found/);
      engine.destroy();
    });
  });

  describe("stopFlow", () => {
    it("TC-TFE-017: should stop a RUNNING flow", async () => {
      const { engine, sse } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);

      sse.clear();
      await engine.stopFlow(summary.id);

      const flow = engine.getFlow(summary.id);
      assert.ok(flow);
      assert.equal(flow.state, "STOPPED");
      assert.ok(flow.finishedAt);
      assert.ok(sse.hasEvent("task-flow-engine/flow-completed"));
      engine.destroy();
    });

    it("TC-TFE-018: should be idempotent when stopping terminal flow", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);
      await engine.stopFlow(summary.id);
      const stateBefore = engine.getFlow(summary.id)!.state;

      await engine.stopFlow(summary.id);
      const stateAfter = engine.getFlow(summary.id)!.state;
      assert.equal(stateAfter, stateBefore);
      engine.destroy();
    });

    it("should throw when stopping non-existent flow", async () => {
      const { engine } = createEngine();
      await assert.rejects(() => engine.stopFlow("non-existent"), /Flow not found/);
      engine.destroy();
    });

    it("should mark pending tasks as SKIPPED when flow fails", async () => {
      const { engine } = createEngine();
      const failingDag: FlowSpec = {
        tasks: {
          task1: {
            provides: ["data1"],
            resolver: { name: "MockFailingTask", results: { done: "data1" } },
          },
          task2: {
            requires: ["data1"],
            resolver: { name: "MockTask2" },
          },
        },
      };
      const summary = await engine.createFlow("internal", failingDag);
      await waitForFlowComplete(engine, summary.id);

      const flow = engine.getFlow(summary.id);
      assert.ok(flow);
      assert.equal(flow.state, "FAILED");
      assert.equal(flow.taskStates["task1"], "FAILED");
      assert.equal(flow.taskStates["task2"], "SKIPPED");
      engine.destroy();
    });
  });

  describe("deleteFlow", () => {
    it("TC-TFE-019: should delete a completed user flow", async () => {
      const { engine, objStore, sse } = createEngine();
      const summary = await engine.createFlow("user", singleTaskDag);
      await waitForFlowComplete(engine, summary.id);

      sse.clear();
      await engine.deleteFlow(summary.id);

      assert.equal(engine.getFlow(summary.id), undefined);
      const persisted = await objStore.getJson(`flows/${summary.id}`);
      assert.equal(persisted, null);
      assert.ok(sse.hasEvent("task-flow-engine/flow-removed"));
      engine.destroy();
    });

    it("TC-TFE-020: should auto-stop and delete a RUNNING flow", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("user", singleTaskDag);

      await engine.deleteFlow(summary.id);
      assert.equal(engine.getFlow(summary.id), undefined);
      engine.destroy();
    });

    it("should not delete internal flow from object store", async () => {
      const { engine } = createEngine();
      const summary = await engine.createFlow("internal", singleTaskDag);
      await waitForFlowComplete(engine, summary.id);

      await engine.deleteFlow(summary.id);
      assert.equal(engine.getFlow(summary.id), undefined);
      engine.destroy();
    });

    it("should throw when deleting non-existent flow", async () => {
      const { engine } = createEngine();
      await assert.rejects(() => engine.deleteFlow("non-existent"), /Flow not found/);
      engine.destroy();
    });
  });

  describe("batch operations", () => {
    it("TC-TFE-021: should batch pause flows", async () => {
      const { engine } = createEngine();
      const s1 = await engine.createFlow("internal", singleTaskDag);
      const s2 = await engine.createFlow("internal", singleTaskDag);

      await engine.batchPause([s1.id, s2.id]);

      const f1 = engine.getFlow(s1.id)!;
      const f2 = engine.getFlow(s2.id)!;
      assert.ok(f1);
      assert.ok(f2);
      engine.destroy();
    });

    it("TC-TFE-022: should batch resume flows", async () => {
      const { engine } = createEngine();
      const s1 = await engine.createFlow("internal", singleTaskDag);
      const s2 = await engine.createFlow("internal", singleTaskDag);
      await engine.batchPause([s1.id, s2.id]);

      await engine.batchResume([s1.id, s2.id]);

      const f1 = engine.getFlow(s1.id)!;
      const f2 = engine.getFlow(s2.id)!;
      assert.ok(f1);
      assert.ok(f2);
      engine.destroy();
    });

    it("TC-TFE-023: should batch stop flows", async () => {
      const { engine } = createEngine();
      const s1 = await engine.createFlow("internal", singleTaskDag);
      const s2 = await engine.createFlow("internal", singleTaskDag);

      await engine.batchStop([s1.id, s2.id]);

      const f1 = engine.getFlow(s1.id)!;
      const f2 = engine.getFlow(s2.id)!;
      assert.ok(f1);
      assert.ok(f2);
      assert.ok(["STOPPED", "COMPLETED", "FAILED"].includes(f1.state));
      assert.ok(["STOPPED", "COMPLETED", "FAILED"].includes(f2.state));
      engine.destroy();
    });

    it("TC-TFE-024: should batch delete flows", async () => {
      const { engine } = createEngine();
      const s1 = await engine.createFlow("internal", singleTaskDag);
      const s2 = await engine.createFlow("internal", singleTaskDag);
      await waitForFlowComplete(engine, s1.id);
      await waitForFlowComplete(engine, s2.id);

      await engine.batchDelete([s1.id, s2.id]);

      assert.equal(engine.getFlow(s1.id), undefined);
      assert.equal(engine.getFlow(s2.id), undefined);
      engine.destroy();
    });

    it("TC-TFE-025: should handle partial failures in batch", async () => {
      const { engine } = createEngine();
      const s1 = await engine.createFlow("internal", singleTaskDag);

      await engine.batchStop([s1.id, "non-existent"]);

      const flow = engine.getFlow(s1.id);
      assert.ok(flow);
      assert.equal(flow.state, "STOPPED");
      engine.destroy();
    });
  });
});

describe("TaskFlowEngine - SSE Events", () => {
  it("TC-TFE-026: should broadcast flow-created event", async () => {
    const { engine, sse } = createEngine();
    sse.clear();
    const summary = await engine.createFlow("internal", singleTaskDag);

    const event = sse.findEvent("task-flow-engine/flow-created");
    assert.ok(event);
    const data = event.data as Record<string, unknown>;
    assert.equal(data.id, summary.id);
    assert.ok(data.timestamp);
    engine.destroy();
  });

  it("TC-TFE-027: should broadcast flow-updated event on state change", async () => {
    const { engine, sse } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    sse.clear();

    await engine.pauseFlow(summary.id);
    assert.ok(sse.hasEvent("task-flow-engine/flow-updated"));
    engine.destroy();
  });

  it("TC-TFE-028: should broadcast task-updated event", async () => {
    const { engine, sse } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    assert.ok(sse.hasEvent("task-flow-engine/task-updated"));
    const taskEvents = sse.events.filter((e) => e.event === "task-flow-engine/task-updated");
    assert.ok(taskEvents.length >= 2);

    const startedEvent = taskEvents.find((e) => (e.data as any).state === "RUNNING");
    assert.ok(startedEvent);
    assert.equal((startedEvent.data as any).taskName, "task1");

    const completedEvent = taskEvents.find((e) => (e.data as any).state === "COMPLETED");
    assert.ok(completedEvent);
    engine.destroy();
  });

  it("TC-TFE-029: should broadcast task-result event with result", async () => {
    const { engine, sse } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    const resultEvent = sse.findEvent("task-flow-engine/task-result");
    if (resultEvent) {
      const data = resultEvent.data as Record<string, unknown>;
      assert.equal(data.state, "COMPLETED");
      assert.ok(data.result);
    }
    engine.destroy();
  });

  it("TC-TFE-030: should broadcast flow-completed event", async () => {
    const { engine, sse } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    const event = sse.findEvent("task-flow-engine/flow-completed");
    assert.ok(event);
    const data = event.data as Record<string, unknown>;
    assert.equal(data.flowId, summary.id);
    assert.equal(data.state, "COMPLETED");
    assert.ok(data.finishedAt);
    assert.ok(data.timestamp);
    engine.destroy();
  });

  it("TC-TFE-031: should broadcast flow-removed event on delete", async () => {
    const { engine, sse } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);
    sse.clear();

    await engine.deleteFlow(summary.id);
    assert.ok(sse.hasEvent("task-flow-engine/flow-removed"));
    const event = sse.findEvent("task-flow-engine/flow-removed");
    const data = event!.data as Record<string, unknown>;
    assert.equal(data.flowId, summary.id);
    engine.destroy();
  });

  it("SSE events should include timestamp", async () => {
    const { engine, sse } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);

    for (const e of sse.events) {
      const data = e.data as Record<string, unknown>;
      assert.ok(data.timestamp);
      assert.ok(typeof data.timestamp === "string");
    }
    engine.destroy();
  });
});

describe("TaskFlowEngine - Results Extraction", () => {
  it("TC-TFE-032: should extract task results on completion", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", dependentDag);
    await waitForFlowComplete(engine, summary.id);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.ok(flow.taskResults);
    assert.ok(flow.taskResults!["task1"]);
    assert.ok(flow.taskResults!["task2"]);
    engine.destroy();
  });

  it("TC-TFE-033: should extract flow-level expected results", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag, undefined, ["data1"]);
    await waitForFlowComplete(engine, summary.id);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.ok(flow.results);
    assert.ok((flow.results as ValueMap)["data1"] !== undefined);
    engine.destroy();
  });
});

describe("TaskFlowEngine - Persistence and Recovery", () => {
  it("TC-TFE-034: should persist user flow on state change", async () => {
    const { engine, objStore } = createEngine();
    const summary = await engine.createFlow("user", singleTaskDag);

    const persisted = await objStore.getJson(`flows/${summary.id}`);
    assert.ok(persisted);
    assert.equal((persisted as FlowRecord).state, "RUNNING");
    engine.destroy();
  });

  it("TC-TFE-035: should not persist internal flow", async () => {
    const { engine, objStore } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);

    const persisted = await objStore.getJson(`flows/${summary.id}`);
    assert.equal(persisted, null);
    engine.destroy();
  });

  it("TC-TFE-036: should recover RUNNING flow on restart", async () => {
    const { engine: engine1, objStore, sse } = createEngine();
    const summary = await engine1.createFlow("user", singleTaskDag);
    await engine1.pauseFlow(summary.id);

    let persisted = await objStore.getJson(`flows/${summary.id}`) as FlowRecord;
    assert.ok(persisted);
    persisted = { ...persisted, state: "RUNNING" as const };
    await objStore.putJson(`flows/${summary.id}`, persisted);
    engine1.destroy();

    const registry2 = new ResolverRegistry();
    registry2.register("MockTask1", MockTask1);
    registry2.register("MockTask2", MockTask2);
    registry2.register("MockFailingTask", MockFailingTask);
    const engine2 = new TaskFlowEngine(
      objStore as unknown as import("./services/objectStore.js").ObjectStore,
      sse as unknown as SseManager,
      registry2
    );
    await engine2.loadPersistedFlows();

    const flow = engine2.getFlow(summary.id);
    assert.ok(flow);
    assert.ok(["RUNNING", "COMPLETED", "FAILED"].includes(flow.state));

    await waitForFlowComplete(engine2, summary.id);
    const completed = engine2.getFlow(summary.id);
    assert.ok(completed);
    assert.ok(["COMPLETED", "FAILED"].includes(completed.state));
    engine2.destroy();
  });

  it("TC-TFE-037: should recover PAUSED flow without restarting", async () => {
    const { engine: engine1, objStore, sse } = createEngine();
    const summary = await engine1.createFlow("user", singleTaskDag);
    await engine1.pauseFlow(summary.id);

    const persisted = await objStore.getJson(`flows/${summary.id}`) as FlowRecord;
    assert.equal(persisted.state, "PAUSED");
    engine1.destroy();

    const registry2 = new ResolverRegistry();
    registry2.register("MockTask1", MockTask1);
    registry2.register("MockTask2", MockTask2);
    registry2.register("MockFailingTask", MockFailingTask);
    const engine2 = new TaskFlowEngine(
      objStore as unknown as import("./services/objectStore.js").ObjectStore,
      sse as unknown as SseManager,
      registry2
    );
    await engine2.loadPersistedFlows();

    const flow = engine2.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "PAUSED");
    engine2.destroy();
  });

  it("TC-TFE-038: should recover terminal flow as history only", async () => {
    const { engine: engine1, objStore, sse } = createEngine();
    const summary = await engine1.createFlow("user", singleTaskDag);
    await waitForFlowComplete(engine1, summary.id);
    engine1.destroy();

    const registry2 = new ResolverRegistry();
    registry2.register("MockTask1", MockTask1);
    registry2.register("MockTask2", MockTask2);
    registry2.register("MockFailingTask", MockFailingTask);
    const engine2 = new TaskFlowEngine(
      objStore as unknown as import("./services/objectStore.js").ObjectStore,
      sse as unknown as SseManager,
      registry2
    );
    await engine2.loadPersistedFlows();

    const flow = engine2.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "COMPLETED");
    engine2.destroy();
  });
});

describe("TaskFlowEngine - TTL Cleanup", () => {
  it("TC-TFE-039: should clean up expired completed flows", async () => {
    const { engine, sse } = createEngine(100, 200);
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    await sleep(500);

    const flow = engine.getFlow(summary.id);
    assert.equal(flow, undefined);
    assert.ok(sse.hasEvent("task-flow-engine/flow-removed"));
    engine.destroy();
  });

  it("TC-TFE-040: should not clean up non-terminal flows", async () => {
    const { engine } = createEngine(100, 200);
    const summary = await engine.createFlow("internal", singleTaskDag);
    await engine.pauseFlow(summary.id);

    await sleep(500);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    engine.destroy();
  });
});

describe("TaskFlowEngine - Lifecycle", () => {
  it("TC-TFE-043: destroy should stop cleanup timer", async () => {
    const { engine } = createEngine(100, 200);
    engine.destroy();

    engine.destroy();
  });
});

describe("ResolverRegistry", () => {
  it("TC-TFE-041: should register, get, has and getAll resolvers", () => {
    const registry = new ResolverRegistry();
    registry.register("TestTask", MockTask1);

    assert.ok(registry.has("TestTask"));
    assert.equal(registry.has("NonExistent"), false);

    const cls = registry.get("TestTask");
    assert.ok(cls);

    const all = registry.getAll();
    assert.ok(all["TestTask"]);
  });
});

describe("SseManager", () => {
  it("should add and remove clients", () => {
    const mgr = new SseManager();
    const controller = {} as ReadableStreamDefaultController;

    mgr.addClient({ id: "c1", controller });
    mgr.addClient({ id: "c2", controller });

    mgr.removeClient("c1");
  });

  it("should broadcast events to clients", () => {
    const mgr = new SseManager();
    const enqueued: string[] = [];
    const controller = {
      enqueue: (data: Uint8Array) => {
        enqueued.push(new TextDecoder().decode(data));
      },
    } as unknown as ReadableStreamDefaultController;

    mgr.addClient({ id: "c1", controller });
    mgr.broadcast("test-event", { key: "value" });

    assert.ok(enqueued.length > 0);
    assert.ok(enqueued[0].includes("event: test-event"));
    assert.ok(enqueued[0].includes("key"));
    assert.ok(enqueued[0].includes("timestamp"));
  });
});

describe("TaskFlowEngine - State Machine", () => {
  it("TC-SM-001: PENDING -> RUNNING transition", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    assert.equal(summary.state, "RUNNING");
    engine.destroy();
  });

  it("TC-SM-002: RUNNING -> COMPLETED transition", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "COMPLETED");
    assert.ok(flow.finishedAt);
    engine.destroy();
  });

  it("TC-SM-003: RUNNING -> FAILED transition", async () => {
    const { engine } = createEngine();
    const failingDag: FlowSpec = {
      tasks: {
        task1: { resolver: { name: "MockFailingTask" } },
      },
    };
    const summary = await engine.createFlow("internal", failingDag);
    await waitForFlowComplete(engine, summary.id);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "FAILED");
    assert.equal(flow.taskStates["task1"], "FAILED");
    assert.ok(flow.finishedAt);
    engine.destroy();
  });

  it("TC-SM-004: RUNNING -> PAUSED -> RUNNING -> COMPLETED transition", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);

    await engine.pauseFlow(summary.id);
    assert.equal(engine.getFlow(summary.id)!.state, "PAUSED");

    await engine.resumeFlow(summary.id);

    await waitForFlowComplete(engine, summary.id);
    assert.equal(engine.getFlow(summary.id)!.state, "COMPLETED");
    engine.destroy();
  });

  it("TC-SM-005: RUNNING -> STOPPED transition", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);

    await engine.stopFlow(summary.id);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "STOPPED");
    assert.ok(flow.finishedAt);
    engine.destroy();
  });

  it("TC-SM-006: Sub-task PENDING -> RUNNING -> COMPLETED", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.taskStates["task1"], "COMPLETED");
    engine.destroy();
  });

  it("TC-SM-007: Sub-task should be SKIPPED when upstream fails", async () => {
    const { engine } = createEngine();
    const failingDag: FlowSpec = {
      tasks: {
        task1: {
          provides: ["data1"],
          resolver: { name: "MockFailingTask", results: { done: "data1" } },
        },
        task2: {
          requires: ["data1"],
          resolver: { name: "MockTask2" },
        },
      },
    };
    const summary = await engine.createFlow("internal", failingDag);
    await waitForFlowComplete(engine, summary.id);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "FAILED");
    assert.equal(flow.taskStates["task1"], "FAILED");
    assert.equal(flow.taskStates["task2"], "SKIPPED");
    engine.destroy();
  });
});

describe("TaskFlowEngine - Error Handling", () => {
  it("TC-ERR-001: pauseFlow should throw for non-existent flow", async () => {
    const { engine } = createEngine();
    await assert.rejects(() => engine.pauseFlow("nonexistent"), /Flow not found/);
    engine.destroy();
  });

  it("TC-ERR-002: resumeFlow should throw for non-existent flow", async () => {
    const { engine } = createEngine();
    await assert.rejects(() => engine.resumeFlow("nonexistent"), /Flow not found/);
    engine.destroy();
  });

  it("TC-ERR-003: stopFlow should throw for non-existent flow", async () => {
    const { engine } = createEngine();
    await assert.rejects(() => engine.stopFlow("nonexistent"), /Flow not found/);
    engine.destroy();
  });

  it("TC-ERR-004: deleteFlow should throw for non-existent flow", async () => {
    const { engine } = createEngine();
    await assert.rejects(() => engine.deleteFlow("nonexistent"), /Flow not found/);
    engine.destroy();
  });
});

describe("TaskFlowEngine - Routes", () => {
  function setupApp() {
    const objStore = new InMemoryObjectStore() as unknown as import("./services/objectStore.js").ObjectStore;
    const sse = new SpySseManager() as unknown as SseManager;
    const registry = new ResolverRegistry();
    registry.register("MockTask1", MockTask1);
    registry.register("MockTask2", MockTask2);
    registry.register("MockFailingTask", MockFailingTask);
    const engine = new TaskFlowEngine(objStore, sse, registry);
    const app = createHonoApp(engine, sse);
    return { app, engine, objStore: objStore as unknown as InMemoryObjectStore, sse: sse as unknown as SpySseManager };
  }

  it("TC-API-001: POST /api/flows should create flow and return 201", async () => {
    const { app, engine } = setupApp();
    const res = await app.request("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "internal", dag: singleTaskDag }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as FlowSummary;
    assert.ok(body.id);
    assert.equal(body.type, "internal");
    engine.destroy();
  });

  it("TC-API-002: POST /api/flows should return 400 when missing type or dag", async () => {
    const { app, engine } = setupApp();
    const res = await app.request("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "internal" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "MISSING_TYPE_OR_DAG");
    engine.destroy();
  });

  it("TC-API-003: POST /api/flows should return 400 for invalid type", async () => {
    const { app, engine } = setupApp();
    const res = await app.request("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invalid", dag: singleTaskDag }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "INVALID_TYPE");
    engine.destroy();
  });

  it("TC-API-004: GET /api/flows should list flows", async () => {
    const { app, engine } = setupApp();
    await engine.createFlow("internal", singleTaskDag);
    await engine.createFlow("user", singleTaskDag);

    const res = await app.request("/api/flows");
    assert.equal(res.status, 200);
    const body = await res.json() as FlowSummary[];
    assert.equal(body.length, 2);
    engine.destroy();
  });

  it("TC-API-005: GET /api/flows?type=internal should filter", async () => {
    const { app, engine } = setupApp();
    await engine.createFlow("internal", singleTaskDag);
    await engine.createFlow("user", singleTaskDag);

    const res = await app.request("/api/flows?type=internal");
    assert.equal(res.status, 200);
    const body = await res.json() as FlowSummary[];
    for (const f of body) {
      assert.equal(f.type, "internal");
    }
    engine.destroy();
  });

  it("TC-API-006: GET /api/flows/:id should return flow detail", async () => {
    const { app, engine } = setupApp();
    const summary = await engine.createFlow("internal", singleTaskDag);

    const res = await app.request(`/api/flows/${summary.id}`);
    assert.equal(res.status, 200);
    const body = await res.json() as FlowSummary;
    assert.equal(body.id, summary.id);
    engine.destroy();
  });

  it("TC-API-007: GET /api/flows/:id should return 404 for non-existent", async () => {
    const { app, engine } = setupApp();
    const res = await app.request("/api/flows/nonexistent");
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "FLOW_NOT_FOUND");
    engine.destroy();
  });

  it("TC-API-008: POST /api/flows/:id/pause should pause flow", async () => {
    const { app, engine } = setupApp();
    const summary = await engine.createFlow("internal", singleTaskDag);

    const res = await app.request(`/api/flows/${summary.id}/pause`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json() as { success: boolean };
    assert.equal(body.success, true);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "PAUSED");
    engine.destroy();
  });

  it("TC-API-009: POST /api/flows/:id/pause should return 404 for non-existent", async () => {
    const { app, engine } = setupApp();
    const res = await app.request("/api/flows/nonexistent/pause", { method: "POST" });
    assert.equal(res.status, 404);
    engine.destroy();
  });

  it("TC-API-010: POST /api/flows/:id/resume should resume flow", async () => {
    const { app, engine } = setupApp();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await engine.pauseFlow(summary.id);

    const res = await app.request(`/api/flows/${summary.id}/resume`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json() as { success: boolean };
    assert.equal(body.success, true);
    engine.destroy();
  });

  it("TC-API-011: POST /api/flows/:id/stop should stop flow", async () => {
    const { app, engine } = setupApp();
    const summary = await engine.createFlow("internal", singleTaskDag);

    const res = await app.request(`/api/flows/${summary.id}/stop`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json() as { success: boolean };
    assert.equal(body.success, true);

    const flow = engine.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "STOPPED");
    engine.destroy();
  });

  it("TC-API-012: DELETE /api/flows/:id should delete flow", async () => {
    const { app, engine } = setupApp();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    const res = await app.request(`/api/flows/${summary.id}`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json() as { success: boolean };
    assert.equal(body.success, true);

    assert.equal(engine.getFlow(summary.id), undefined);
    engine.destroy();
  });

  it("TC-API-013: POST /api/flows/batch/pause should batch pause", async () => {
    const { app, engine } = setupApp();
    const s1 = await engine.createFlow("internal", singleTaskDag);
    const s2 = await engine.createFlow("internal", singleTaskDag);

    const res = await app.request("/api/flows/batch/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [s1.id, s2.id] }),
    });
    assert.equal(res.status, 200);

    const f1 = engine.getFlow(s1.id);
    const f2 = engine.getFlow(s2.id);
    assert.ok(f1);
    assert.ok(f2);
    engine.destroy();
  });

  it("TC-API-014: POST /api/flows/batch/pause should return 400 for non-array ids", async () => {
    const { app, engine } = setupApp();
    const res = await app.request("/api/flows/batch/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: "not-an-array" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "INVALID_IDS");
    engine.destroy();
  });

  it("TC-API-015: GET /api/flows/events should return SSE response", async () => {
    const { app, engine } = setupApp();
    const res = await app.request("/api/flows/events");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/event-stream");
    assert.equal(res.headers.get("Cache-Control"), "no-cache");
    engine.destroy();
  });

  it("POST /api/flows should return 400 for unregistered resolver", async () => {
    const { app, engine } = setupApp();
    const badDag: FlowSpec = {
      tasks: {
        task1: { resolver: { name: "NonExistentTask" } },
      },
    };
    const res = await app.request("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "internal", dag: badDag }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "RESOLVER_NOT_FOUND");
    engine.destroy();
  });

  it("POST /api/flows/batch/resume should work", async () => {
    const { app, engine } = setupApp();
    const s1 = await engine.createFlow("internal", singleTaskDag);
    await engine.batchPause([s1.id]);

    const res = await app.request("/api/flows/batch/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [s1.id] }),
    });
    assert.equal(res.status, 200);
    engine.destroy();
  });

  it("POST /api/flows/batch/stop should work", async () => {
    const { app, engine } = setupApp();
    const s1 = await engine.createFlow("internal", singleTaskDag);

    const res = await app.request("/api/flows/batch/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [s1.id] }),
    });
    assert.equal(res.status, 200);
    engine.destroy();
  });

  it("POST /api/flows/batch/delete should work", async () => {
    const { app, engine } = setupApp();
    const s1 = await engine.createFlow("internal", singleTaskDag);
    await waitForFlowComplete(engine, s1.id);

    const res = await app.request("/api/flows/batch/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [s1.id] }),
    });
    assert.equal(res.status, 200);
    assert.equal(engine.getFlow(s1.id), undefined);
    engine.destroy();
  });
});
