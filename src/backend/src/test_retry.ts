import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import type { FlowSpec, ValueMap, ITaskResolver } from "flowed";
import { TaskFlowEngine } from "./services/taskFlowEngine/taskFlowEngine.js";
import type { FlowRecord } from "./services/taskFlowEngine/taskFlowEngine.js";
import { ResolverRegistry } from "./services/taskFlowEngine/resolverRegistry.js";
import { SseManager } from "./services/sseManager.js";
import type { ObjectStoreResource } from "./services/objectStore.js";

class InMemoryObjectStore {
  private store = new Map<string, unknown>();
  async putJson(path: string, data: unknown): Promise<void> {
    this.store.set(path, data);
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
    const val = this.store.get(path);
    return val !== undefined ? (val as T) : null;
  }
  async deletePath(path: string): Promise<boolean> {
    return this.store.delete(path);
  }
}

class SpySseManager {
  events: { event: string; data: unknown }[] = [];
  private handlers: any[] = [];
  private clients = new Map<string, any>();
  registerHandler(handler: any): void {
    if (!this.handlers.includes(handler)) this.handlers.push(handler);
  }
  unregisterHandler(handler: any): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) this.handlers.splice(index, 1);
  }
  addClient(client: any): void {
    this.clients.set(client.id, client);
    for (const handler of this.handlers) {
      try { handler.onClientConnected(this as any, client.id); } catch {}
    }
  }
  removeClient(id: string): void {
    if (!this.clients.has(id)) return;
    this.clients.delete(id);
    for (const handler of this.handlers) {
      try { handler.onClientDisconnected(this as any, id); } catch {}
    }
  }
  sendToClient<T>(_clientId: string, event: string, payload: T): boolean {
    this.events.push({ event, data: { event, payload, timestamp: new Date().toISOString() } });
    return true;
  }
  broadcast<T>(event: string, payload: T): void {
    this.events.push({ event, data: { event, payload, timestamp: new Date().toISOString() } });
  }
  getClientCount(): number { return this.clients.size; }
}

class MockTask1 implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    return { done: true, result: "mock1-result", value: params.value ?? "default" };
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

function createEngine() {
  const objStore = new InMemoryObjectStore() as any;
  const sse = new SpySseManager() as any;
  const registry = new ResolverRegistry();
  registry.register("MockTask1", MockTask1);
  const engine = new TaskFlowEngine(objStore, sse, registry, {
    completedFlowTtlMs: 100,
    cleanupIntervalMs: 200,
  });
  return { engine, objStore, sse };
}

function waitForFlowComplete(engine: TaskFlowEngine, id: string, timeoutMs = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const summary = engine.getFlow(id);
      if (!summary) { clearInterval(timer); reject(new Error("Flow not found")); return; }
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

describe("Retry Tests", () => {
  it("TC-TFE-045: should retry a completed flow resetting its state", async () => {
    const { engine, objStore } = createEngine();
    const summary = await engine.createFlow("user", singleTaskDag);
    await waitForFlowComplete(engine, summary.id);

    const retried = await engine.retryFlow(summary.id);
    assert.equal(retried.id, summary.id);
    assert.equal(retried.state, "RUNNING");
    assert.equal(retried.taskStates["task1"], "PENDING");

    const persisted = await objStore.getJson(`flows/${summary.id}`) as FlowRecord;
    assert.ok(persisted);
    assert.equal(persisted.id, summary.id);
    assert.equal(persisted.state, "RUNNING");

    engine.destroy();
  });

  it("TC-TFE-046: should allow retry on a PENDING flow loaded after restart", async () => {
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
    const engine2 = new TaskFlowEngine(
      objStore as any,
      sse as any,
      registry2
    );
    await engine2.loadPersistedFlows();

    const flow = engine2.getFlow(summary.id);
    assert.ok(flow);
    assert.equal(flow.state, "PENDING");

    const retried = await engine2.retryFlow(summary.id);
    assert.equal(retried.id, summary.id);
    assert.equal(retried.state, "RUNNING");

    await waitForFlowComplete(engine2, summary.id);
    const completed = engine2.getFlow(summary.id);
    assert.ok(completed);
    assert.ok(["COMPLETED", "FAILED"].includes(completed.state));
    engine2.destroy();
  });

  it("TC-TFE-047: should throw when retrying non-existent flow", async () => {
    const { engine } = createEngine();
    await assert.rejects(() => engine.retryFlow("nonexistent"), /Flow not found/);
    engine.destroy();
  });

  it("TC-TFE-048: should throw when retrying a running flow", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await assert.rejects(() => engine.retryFlow(summary.id), /Cannot retry a running or paused flow/);
    engine.destroy();
  });

  it("TC-TFE-049: should throw when retrying a paused flow", async () => {
    const { engine } = createEngine();
    const summary = await engine.createFlow("internal", singleTaskDag);
    await engine.pauseFlow(summary.id);
    await assert.rejects(() => engine.retryFlow(summary.id), /Cannot retry a running or paused flow/);
    engine.destroy();
  });
});
