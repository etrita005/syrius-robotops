import {
  Flow,
  FlowManager,
  type FlowedLogEntry,
  type FlowSpec,
  type ValueMap,
} from "flowed";

type SerializedFlowRunStatus = ReturnType<Flow["getSerializableState"]>;
import { randomUUID } from "node:crypto";
import * as store from "./store.js";
import { mockResolvers } from "./mockResolvers.js";

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

interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
}

function nowISO(): string {
  return new Date().toISOString();
}

function getTaskCodes(dag: FlowSpec): string[] {
  return Object.keys(dag.tasks ?? {});
}

export class TaskFlowEngine {
  private flows = new Map<string, FlowRecord>();
  private flowInstances = new Map<string, Flow>();
  private sseClients = new Set<SSEClient>();

  constructor() {
    FlowManager.installLogger({ log: (entry) => this.handleLogEntry(entry) });
  }

  // ---------------------------------------------------------------------------
  // Flow lifecycle
  // ---------------------------------------------------------------------------

  async createFlow(type: FlowType, dag: FlowSpec): Promise<FlowSummary> {
    const id = randomUUID();

    // auto-patch resolver.results so flowed knows how to map MockTask return values
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
    this.broadcast("task-flow-engine/flow-created", this.summarize(record));

    // auto-start
    this.startFlow(id);

    return this.summarize(record);
  }

  private startFlow(id: string): void {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) return;

    record.state = "RUNNING";
    this.saveFlow(record).catch(() => {});
    this.broadcast("task-flow-engine/flow-updated", this.summarize(record));

    flow
      .start({}, [], mockResolvers, {}, { instanceId: id })
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

    // mark remaining pending tasks as skipped for failed/stopped flows
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
    this.broadcast("task-flow-engine/flow-updated", this.summarize(record));
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
    this.broadcast("task-flow-engine/flow-updated", this.summarize(record));
  }

  async resumeFlow(id: string): Promise<void> {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) throw new Error("Flow not found");
    if (record.state !== "PAUSED") return;

    record.state = "RUNNING";
    this.saveFlow(record).catch(() => {});
    this.broadcast("task-flow-engine/flow-updated", this.summarize(record));

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
      await store.remove(["flows", id]);
    }

    this.broadcast("task-flow-engine/flow-removed", { flowId: id });
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
    // sort by createdAt desc
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results;
  }

  // ---------------------------------------------------------------------------
  // Batch operations
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // SSE
  // ---------------------------------------------------------------------------

  addSSEClient(client: SSEClient): void {
    this.sseClients.add(client);
  }

  removeSSEClient(id: string): void {
    for (const c of this.sseClients) {
      if (c.id === id) {
        this.sseClients.delete(c);
        break;
      }
    }
  }

  broadcast(event: string, data: unknown): void {
    const enriched =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? { ...(data as Record<string, unknown>), timestamp: new Date().toISOString() }
        : data;
    const payload = `event: ${event}\ndata: ${JSON.stringify(enriched)}\n\n`;
    const encoder = new TextEncoder();
    for (const client of this.sseClients) {
      try {
        client.controller.enqueue(encoder.encode(payload));
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  async saveFlow(record: FlowRecord): Promise<void> {
    if (record.type === "internal") return;
    const flow = this.flowInstances.get(record.id);
    const payload: FlowRecord = {
      ...record,
      serializedRunStatus: flow ? flow.getSerializableState() : record.serializedRunStatus,
    };
    await store.put(
      ["flows", record.id],
      Buffer.from(JSON.stringify(payload)),
      "application/json"
    );
  }

  async loadFlows(): Promise<void> {
    let entries: store.ResourceInfo[];
    try {
      entries = await store.list(["flows"]);
    } catch {
      return;
    }

    for (const child of entries) {
      if (child.type !== "file") continue;
      const result = await store.get(["flows", child.name]);
      if (!result || result.type !== "file") continue;
      try {
        const record = JSON.parse(result.content.toString("utf-8")) as FlowRecord;
        // validate
        if (!record.id || !record.dag) continue;

        const flow = new Flow(record.dag, record.serializedRunStatus);
        this.flows.set(record.id, record);
        this.flowInstances.set(record.id, flow);

        if (record.state === "RUNNING") {
          this.startFlow(record.id);
        }
        // if PAUSED, leave as-is; user must resume manually
        // if COMPLETED/FAILED/STOPPED, leave as terminal state
      } catch (err) {
        console.error(`Failed to load flow ${child.name}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private handleLogEntry(entry: FlowedLogEntry): void {
    const flowId = entry.objectId;
    if (!flowId) return;
    const record = this.flows.get(flowId);
    if (!record) return;

    if (entry.eventType === "Task.Started") {
      const taskCode = (entry.extra?.task as { code?: string } | undefined)?.code;
      if (taskCode) {
        record.taskStates[taskCode] = "RUNNING";
        this.broadcast("task-flow-engine/task-updated", {
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
        this.broadcast("task-flow-engine/task-updated", {
          flowId,
          taskName: taskCode,
          state: record.taskStates[taskCode],
        });
      }
    }

    // Persist on task events
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
      this.broadcast("task-flow-engine/flow-updated", this.summarize(record));
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
