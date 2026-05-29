import {
  Flow,
  FlowManager,
  type FlowedLogEntry,
  type FlowSpec,
  type ValueMap,
} from "flowed";
import { randomUUID } from "node:crypto";
import type { ObjectStore } from "../objectStore.js";
import type { ResolverRegistry } from "./resolverRegistry.js";
import type { SseManager } from "./sseManager.js";

type SerializedFlowRunStatus = ReturnType<Flow["getSerializableState"]>;

export type FlowType = "internal" | "user";
export type FlowState = "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "STOPPED";
export type TaskState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

export interface FlowRecord {
  id: string;
  type: FlowType;
  dag: FlowSpec;
  state: FlowState;
  taskStates: Record<string, TaskState>;
  serializedRunStatus?: SerializedFlowRunStatus;
  createdAt: string;
}

export interface FlowSummary {
  id: string;
  type: FlowType;
  state: FlowState;
  taskStates: Record<string, TaskState>;
  createdAt: string;
}

function nowISO(): string {
  return new Date().toISOString();
}

function getTaskCodes(dag: FlowSpec): string[] {
  return Object.keys(dag.tasks ?? {});
}

const SSE_PREFIX = "task-flow-engine";

export class TaskFlowEngine {
  private flows = new Map<string, FlowRecord>();
  private flowInstances = new Map<string, Flow>();
  private sseManager: SseManager;
  private resolverRegistry: ResolverRegistry;
  private objectStore: ObjectStore;
  private loggerInstalled = false;

  constructor(objectStore: ObjectStore, sseManager: SseManager, resolverRegistry: ResolverRegistry) {
    this.objectStore = objectStore;
    this.sseManager = sseManager;
    this.resolverRegistry = resolverRegistry;
  }

  private ensureLogger(): void {
    if (this.loggerInstalled) return;
    FlowManager.installLogger({ log: (entry) => this.handleLogEntry(entry) });
    this.loggerInstalled = true;
  }

  async createFlow(type: FlowType, dag: FlowSpec): Promise<FlowSummary> {
    this.ensureLogger();
    const id = randomUUID();

    const tasks = (dag as any).tasks ?? {};
    for (const code of Object.keys(tasks)) {
      const task = tasks[code];
      if (task?.provides?.length && task.resolver && !task.resolver.results) {
        task.resolver.results = { done: task.provides[0] };
      }
    }

    const taskCodes = getTaskCodes(dag);
    const taskStates: Record<string, TaskState> = {};
    for (const code of taskCodes) {
      taskStates[code] = "PENDING";
    }

    const record: FlowRecord = {
      id,
      type,
      dag,
      state: "PENDING",
      taskStates,
      createdAt: nowISO(),
    };

    const flow = new Flow(dag);
    this.flows.set(id, record);
    this.flowInstances.set(id, flow);

    await this.saveFlow(record);
    this.sseManager.broadcast(`${SSE_PREFIX}/flow-created`, this.summarize(record));

    this.startFlow(id);

    return this.summarize(record);
  }

  private startFlow(id: string): void {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) return;

    record.state = "RUNNING";
    this.saveFlow(record).catch(() => {});
    this.sseManager.broadcast(`${SSE_PREFIX}/flow-updated`, this.summarize(record));

    const resolvers = this.resolverRegistry.getAll();

    flow
      .start({}, [], resolvers, {}, { instanceId: id })
      .then(() => {
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "COMPLETED";
        }
        this.finalizeFlow(id);
      })
      .catch(() => {
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "FAILED";
        }
        this.finalizeFlow(id);
      });
  }

  private finalizeFlow(id: string): void {
    const record = this.flows.get(id);
    if (!record) return;

    if (record.state === "FAILED" || record.state === "STOPPED") {
      for (const code of Object.keys(record.taskStates)) {
        if (record.taskStates[code] === "PENDING") {
          record.taskStates[code] = "SKIPPED";
        }
      }
    }

    const flow = this.flowInstances.get(id);
    if (flow) {
      try {
        record.serializedRunStatus = flow.getSerializableState();
      } catch {
        // ignore
      }
    }

    this.saveFlow(record).catch(() => {});
    this.sseManager.broadcast(`${SSE_PREFIX}/flow-updated`, this.summarize(record));
  }

  async pauseFlow(id: string): Promise<void> {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) throw new Error("Flow not found");
    if (record.state !== "RUNNING") return;

    await flow.pause();
    record.state = "PAUSED";
    try {
      record.serializedRunStatus = flow.getSerializableState();
    } catch {
      // ignore
    }
    await this.saveFlow(record);
    this.sseManager.broadcast(`${SSE_PREFIX}/flow-updated`, this.summarize(record));
  }

  async resumeFlow(id: string): Promise<void> {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) throw new Error("Flow not found");
    if (record.state !== "PAUSED") return;

    record.state = "RUNNING";
    this.saveFlow(record).catch(() => {});
    this.sseManager.broadcast(`${SSE_PREFIX}/flow-updated`, this.summarize(record));

    flow
      .resume()
      .then(() => {
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "COMPLETED";
        }
        this.finalizeFlow(id);
      })
      .catch(() => {
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "FAILED";
        }
        this.finalizeFlow(id);
      });
  }

  async stopFlow(id: string): Promise<void> {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) throw new Error("Flow not found");
    if (record.state === "COMPLETED" || record.state === "FAILED" || record.state === "STOPPED") {
      return;
    }

    await flow.stop();
    record.state = "STOPPED";
    this.finalizeFlow(id);
  }

  async deleteFlow(id: string): Promise<void> {
    const record = this.flows.get(id);
    if (!record) throw new Error("Flow not found");

    if (record.state === "RUNNING" || record.state === "PAUSED") {
      await this.stopFlow(id);
    }

    this.flows.delete(id);
    this.flowInstances.delete(id);

    if (record.type === "user") {
      await this.objectStore.deletePath(`flows/${id}`).catch(() => {});
    }

    this.sseManager.broadcast(`${SSE_PREFIX}/flow-removed`, { flowId: id });
  }

  getFlow(id: string): FlowSummary | undefined {
    const record = this.flows.get(id);
    return record ? this.summarize(record) : undefined;
  }

  listFlows(filterType?: FlowType): FlowSummary[] {
    const results: FlowSummary[] = [];
    for (const record of this.flows.values()) {
      if (!filterType || record.type === filterType) {
        results.push(this.summarize(record));
      }
    }
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results;
  }

  async batchPause(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.pauseFlow(id).catch(() => {})));
  }

  async batchResume(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.resumeFlow(id).catch(() => {})));
  }

  async batchStop(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.stopFlow(id).catch(() => {})));
  }

  async batchDelete(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.deleteFlow(id).catch(() => {})));
  }

  async loadPersistedFlows(): Promise<void> {
    const entries = await this.objectStore.list("flows").catch(() => [] as any[]);

    for (const child of entries) {
      if (child.type !== "file") continue;
      const record = await this.objectStore.getJson<FlowRecord>(`flows/${child.name}`).catch(() => null);
      if (!record || !record.id || !record.dag) continue;

      try {
        const flow = new Flow(record.dag, record.serializedRunStatus);
        this.flows.set(record.id, record);
        this.flowInstances.set(record.id, flow);

        if (record.state === "RUNNING") {
          this.ensureLogger();
          this.startFlow(record.id);
        }
      } catch (err) {
        console.error(`Failed to load flow ${child.name}:`, err);
      }
    }
  }

  private async saveFlow(record: FlowRecord): Promise<void> {
    if (record.type === "internal") return;
    const flow = this.flowInstances.get(record.id);
    const payload: FlowRecord = {
      ...record,
      serializedRunStatus: flow ? flow.getSerializableState() : record.serializedRunStatus,
    };
    await this.objectStore.putJson(`flows/${record.id}`, payload);
  }

  private handleLogEntry(entry: FlowedLogEntry): void {
    const flowId = entry.objectId;
    if (!flowId) return;
    const record = this.flows.get(flowId);
    if (!record) return;

    if (entry.eventType === "Task.Started") {
      const taskCode = (entry.extra?.task as { code?: string } | undefined)?.code;
      if (taskCode) {
        record.taskStates[taskCode] = "RUNNING";
        this.sseManager.broadcast(`${SSE_PREFIX}/task-updated`, {
          flowId,
          taskName: taskCode,
          state: "RUNNING",
        });
      }
    } else if (entry.eventType === "Task.Finished") {
      const taskCode = (entry.extra?.task as { code?: string } | undefined)?.code;
      if (taskCode) {
        const isError = entry.level === "error";
        record.taskStates[taskCode] = isError ? "FAILED" : "COMPLETED";
        this.sseManager.broadcast(`${SSE_PREFIX}/task-updated`, {
          flowId,
          taskName: taskCode,
          state: record.taskStates[taskCode],
        });
      }
    }

    if (entry.eventType === "Task.Started" || entry.eventType === "Task.Finished") {
      const flow = this.flowInstances.get(flowId);
      if (flow) {
        try {
          record.serializedRunStatus = flow.getSerializableState();
        } catch {
          // ignore
        }
      }
      this.saveFlow(record).catch(() => {});
      this.sseManager.broadcast(`${SSE_PREFIX}/flow-updated`, this.summarize(record));
    }
  }

  private summarize(record: FlowRecord): FlowSummary {
    return {
      id: record.id,
      type: record.type,
      state: record.state,
      taskStates: { ...record.taskStates },
      createdAt: record.createdAt,
    };
  }
}
