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
import type { SseManager, ISseManagerEventHandler } from "../sseManager.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("TaskFlowEngine");

type SerializedFlowRunStatus = ReturnType<Flow["getSerializableState"]>;

export type FlowType = "internal" | "user";
export type FlowState = "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "STOPPED";
export type TaskState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
export type FlowPhase = "main" | "error";

export interface ErrorContext {
  failedTaskCode: string;
  errorMessage: string;
  completedTasks: string[];
  mainTaskStates: Record<string, TaskState>;
  mainTaskResults?: Record<string, ValueMap>;
  mainResults?: ValueMap;
}

export interface FlowRecord {
  id: string;
  type: FlowType;
  input?: ValueMap;
  expectedResults?: string[];
  dag: FlowSpec;
  state: FlowState;
  taskStates: Record<string, TaskState>;
  taskResults?: Record<string, ValueMap>;
  results?: ValueMap;
  serializedRunStatus?: SerializedFlowRunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorDag?: FlowSpec;
  phase?: FlowPhase;
  errorContext?: ErrorContext;
  mainTaskStates?: Record<string, TaskState>;
  errorTaskStates?: Record<string, TaskState>;
  serializedErrorRunStatus?: SerializedFlowRunStatus;
}

export interface FlowSummary {
  id: string;
  type: FlowType;
  state: FlowState;
  taskStates: Record<string, TaskState>;
  taskResults?: Record<string, ValueMap>;
  results?: ValueMap;
  input?: ValueMap;
  expectedResults?: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorDag?: FlowSpec;
  phase?: FlowPhase;
}

export interface TaskFlowEngineOptions {
  completedFlowTtlMs?: number;
  cleanupIntervalMs?: number;
}

function nowISO(): string {
  return new Date().toISOString();
}

function getTaskCodes(dag: FlowSpec): string[] {
  return Object.keys(dag.tasks ?? {});
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export class TaskFlowEngine implements ISseManagerEventHandler {
  private flows = new Map<string, FlowRecord>();
  private flowInstances = new Map<string, Flow>();
  private sseManager: SseManager;
  private objectStore: ObjectStore;
  private resolverRegistry: ResolverRegistry;
  private completedFlowTtlMs: number;
  private cleanupIntervalMs: number;
  private flowContext: ValueMap;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;
  private loggerInstalled = false;

  constructor(
    objectStore: ObjectStore,
    sseManager: SseManager,
    resolverRegistry: ResolverRegistry,
    options?: TaskFlowEngineOptions
  ) {
    this.objectStore = objectStore;
    this.sseManager = sseManager;
    this.resolverRegistry = resolverRegistry;
    this.completedFlowTtlMs = options?.completedFlowTtlMs ?? DEFAULT_TTL_MS;
    this.cleanupIntervalMs = options?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.flowContext = {};
    this.startCleanupTimer();
    this.sseManager.registerHandler(this);
  }

  onClientConnected(sseManager: SseManager, clientId: string): void {
    for (const record of this.flows.values()) {
      sseManager.sendToClient(clientId, "task-flow-engine/flow-current", this.summarize(record));
    }
  }

  onClientDisconnected(_sseManager: SseManager, _clientId: string): void {
    // No per-client state to clean up.
  }

  setFlowContext(context: ValueMap): void {
    this.flowContext = { ...context };
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => this.cleanupExpiredFlows(), this.cleanupIntervalMs);
  }

  private emitFlowCreated(record: FlowRecord): void {
    this.sseManager.broadcast("task-flow-engine/flow-created", this.summarize(record));
  }

  private emitFlowUpdated(record: FlowRecord): void {
    this.sseManager.broadcast("task-flow-engine/flow-updated", this.summarize(record));
  }

  private emitFlowCompleted(record: FlowRecord): void {
    this.sseManager.broadcast("task-flow-engine/flow-completed", {
      flowId: record.id,
      state: record.state,
      results: record.results ?? null,
      finishedAt: record.finishedAt,
    });
  }

  private emitFlowRemoved(flowId: string): void {
    this.sseManager.broadcast("task-flow-engine/flow-removed", { flowId });
  }

  private emitTaskUpdated(flowId: string, taskName: string, state: TaskState): void {
    this.sseManager.broadcast("task-flow-engine/task-updated", { flowId, taskName, state });
  }

  private emitTaskResult(flowId: string, taskName: string, result: ValueMap): void {
    this.sseManager.broadcast("task-flow-engine/task-result", {
      flowId,
      taskName,
      state: "COMPLETED",
      result,
    });
  }

  private emitErrorHandlingStarted(record: FlowRecord): void {
    this.sseManager.broadcast("task-flow-engine/error-handling-started", {
      flowId: record.id,
      errorContext: record.errorContext,
    });
  }

  private emitErrorHandlingCompleted(record: FlowRecord): void {
    this.sseManager.broadcast("task-flow-engine/error-handling-completed", {
      flowId: record.id,
      state: record.state,
    });
  }

  private cleanupExpiredFlows(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, record] of this.flows) {
      if (
        (record.state === "COMPLETED" || record.state === "FAILED" || record.state === "STOPPED") &&
        record.finishedAt
      ) {
        const finishedMs = new Date(record.finishedAt).getTime();
        if (now - finishedMs > this.completedFlowTtlMs) {
          expiredIds.push(id);
        }
      }
    }

    for (const id of expiredIds) {
      const record = this.flows.get(id);
      this.flows.delete(id);
      this.flowInstances.delete(id);
      if (record?.type === "user") {
        this.objectStore.deletePath(`flows/${id}`).catch(() => {});
      }
      this.emitFlowRemoved(id);
    }

    if (expiredIds.length > 0) {
      log.info({ count: expiredIds.length }, 'Expired flows cleaned up');
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private ensureLogger(): void {
    if (this.loggerInstalled) return;
    FlowManager.installLogger({ log: (entry: FlowedLogEntry) => this.handleLogEntry(entry) });
    this.loggerInstalled = true;
  }

  private validateResolvers(dag: FlowSpec): void {
    const tasks = (dag as Record<string, unknown>).tasks as
      | Record<string, { resolver?: { name?: string } }>
      | undefined;
    if (!tasks) return;
    for (const [taskCode, taskSpec] of Object.entries(tasks)) {
      const resolverName = taskSpec?.resolver?.name;
      if (resolverName && !this.resolverRegistry.has(resolverName)) {
        throw new Error(`Resolver '${resolverName}' is not registered`);
      }
    }
  }

  private validateAllResolvers(dag: FlowSpec, errorDag?: FlowSpec): void {
    this.validateResolvers(dag);
    if (errorDag) {
      this.validateResolvers(errorDag);
    }
  }

  async createFlow(
    type: FlowType,
    dag: FlowSpec,
    input?: ValueMap,
    expectedResults?: string[],
    errorDag?: FlowSpec
  ): Promise<FlowSummary> {
    this.ensureLogger();
    this.validateAllResolvers(dag, errorDag);

    const id = randomUUID();

    const tasks = (dag as Record<string, unknown>).tasks as
      | Record<string, { provides?: string[]; resolver?: { results?: Record<string, string> } }>
      | undefined;

    if (tasks) {
      for (const code of Object.keys(tasks)) {
        const task = tasks[code];
        if (task?.provides?.length && task.resolver && !task.resolver.results) {
          task.resolver.results = { done: task.provides[0] };
        }
      }
    }

    if (errorDag) {
      const errorTasks = (errorDag as Record<string, unknown>).tasks as
        | Record<string, { provides?: string[]; resolver?: { results?: Record<string, string> } }>
        | undefined;
      if (errorTasks) {
        for (const code of Object.keys(errorTasks)) {
          const task = errorTasks[code];
          if (task?.provides?.length && task.resolver && !task.resolver.results) {
            task.resolver.results = { done: task.provides[0] };
          }
        }
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
      input,
      expectedResults,
      dag,
      state: "PENDING",
      taskStates,
      createdAt: nowISO(),
      errorDag,
      phase: "main",
    };

    const flow = new Flow(dag);
    this.flows.set(id, record);
    this.flowInstances.set(id, flow);

    await this.saveFlow(record);
    this.emitFlowCreated(record);

    log.info({ flowId: id, type, taskCount: taskCodes.length, hasErrorDag: !!errorDag }, 'Flow created');

    this.startFlow(id);

    return this.summarize(record);
  }

  private startFlow(id: string): void {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) return;

    record.state = "RUNNING";
    record.startedAt = record.startedAt ?? nowISO();
    this.saveFlow(record).catch((err: unknown) => { log.warn({ flowId: record.id, err }, 'Failed to persist flow on start'); });
    this.emitFlowUpdated(record);

    log.info({ flowId: id, type: record.type, phase: record.phase }, 'Flow started');

    const startParams = record.input ?? {};
    const expected = this.computeExpectedResults(record);
    const resolvers = this.resolverRegistry.getAll();

    flow
      .start(startParams, expected, resolvers, this.flowContext, { instanceId: id })
      .then((flowResults: ValueMap) => {
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          if (record.phase === "error") {
            record.state = "FAILED";
          } else {
            record.state = "COMPLETED";
          }
        }
        if (flowResults && Object.keys(flowResults).length > 0) {
          record.results = {};
          for (const key of record.expectedResults ?? []) {
            if (flowResults[key] !== undefined) {
              (record.results as ValueMap)[key] = flowResults[key];
            }
          }
          this.extractTaskResults(id, flowResults);
        }
        if (record.phase === "error") {
          this.emitErrorHandlingCompleted(record);
        }
        this.finalizeFlow(id);
      })
      .catch((err: unknown) => {
        log.error({ flowId: id, err: err instanceof Error ? err.message : String(err) }, 'Flow failed');
        if (record.phase === "main" && record.errorDag) {
          this.startErrorFlow(id, err);
          return;
        }
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "FAILED";
        }
        if (record.phase === "error") {
          this.emitErrorHandlingCompleted(record);
        }
        this.finalizeFlow(id);
      });
  }

  private startErrorFlow(id: string, err: unknown): void {
    const record = this.flows.get(id);
    if (!record || !record.errorDag) return;

    const errorMessage = err instanceof Error ? err.message : String(err);

    const failedTaskCode = Object.entries(record.taskStates).find(
      ([, state]) => state === "FAILED"
    )?.[0] ?? "unknown";

    const completedTasks = Object.entries(record.taskStates)
      .filter(([, state]) => state === "COMPLETED")
      .map(([code]) => code);

    const errorContext: ErrorContext = {
      failedTaskCode,
      errorMessage,
      completedTasks,
      mainTaskStates: { ...record.taskStates },
      mainTaskResults: record.taskResults ? { ...record.taskResults } : undefined,
      mainResults: record.results ? { ...record.results } : undefined,
    };

    try {
      record.serializedRunStatus = this.flowInstances.get(id)?.getSerializableState();
    } catch {
      // ignore
    }

    for (const code of Object.keys(record.taskStates)) {
      if (record.taskStates[code] === "PENDING") {
        record.taskStates[code] = "SKIPPED";
      }
    }

    record.mainTaskStates = { ...record.taskStates };
    record.taskStates = {};
    for (const code of getTaskCodes(record.errorDag)) {
      record.taskStates[code] = "PENDING";
    }
    record.phase = "error";
    record.errorContext = errorContext;
    record.state = "RUNNING";

    const inputWithError = {
      ...(record.input ?? {}),
      errorContext,
    };

    const errorFlow = new Flow(record.errorDag);
    this.flowInstances.set(id, errorFlow);

    const expected = this.computeExpectedResults({ ...record, dag: record.errorDag });
    const resolvers = this.resolverRegistry.getAll();

    this.saveFlow(record).catch((err: unknown) => { log.warn({ flowId: record.id, err }, 'Failed to persist flow on error phase'); });
    this.emitFlowUpdated(record);
    this.emitErrorHandlingStarted(record);

    log.warn({ flowId: id, failedTaskCode, errorMessage }, 'Error handling phase started');

    errorFlow
      .start(inputWithError, expected, resolvers, this.flowContext, { instanceId: id })
      .then((flowResults: ValueMap) => {
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "FAILED";
        }
        if (flowResults && Object.keys(flowResults).length > 0) {
          record.results = { ...(record.results ?? {}), ...flowResults };
        }
        record.errorTaskStates = { ...record.taskStates };
        record.taskStates = record.mainTaskStates ?? {};
        try {
          record.serializedErrorRunStatus = this.flowInstances.get(id)?.getSerializableState();
        } catch {
          // ignore
        }
        this.emitErrorHandlingCompleted(record);
        this.finalizeFlow(id);
      })
      .catch((errorErr: unknown) => {
        log.error({ flowId: id, err: errorErr instanceof Error ? errorErr.message : String(errorErr) }, 'Error flow failed');
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "FAILED";
        }
        record.errorTaskStates = { ...record.taskStates };
        record.taskStates = record.mainTaskStates ?? {};
        try {
          record.serializedErrorRunStatus = this.flowInstances.get(id)?.getSerializableState();
        } catch {
          // ignore
        }
        this.emitErrorHandlingCompleted(record);
        this.finalizeFlow(id);
      });
  }

  private computeExpectedResults(record: FlowRecord): string[] {
    const allProvides: string[] = [];
    const tasks = (record.dag as Record<string, unknown>).tasks as
      | Record<string, { provides?: string[] }>
      | undefined;

    if (tasks) {
      for (const taskSpec of Object.values(tasks)) {
        if (taskSpec.provides) {
          allProvides.push(...taskSpec.provides);
        }
      }
    }

    return [...new Set([...allProvides, ...(record.expectedResults ?? [])])];
  }

  private extractTaskResults(id: string, flowResults: ValueMap): void {
    const record = this.flows.get(id);
    if (!record) return;

    if (!record.taskResults) {
      record.taskResults = {};
    }

    const tasks = (record.dag as Record<string, unknown>).tasks as
      | Record<string, { resolver?: { results?: Record<string, string> } }>
      | undefined;

    if (!tasks) return;

    for (const [taskCode, taskSpec] of Object.entries(tasks)) {
      const resultMapping = taskSpec?.resolver?.results;
      if (!resultMapping) continue;

      const taskResult: ValueMap = {};
      for (const [resolverKey, flowKey] of Object.entries(resultMapping)) {
        if (flowResults[flowKey] !== undefined) {
          taskResult[resolverKey] = flowResults[flowKey];
        }
      }
      if (Object.keys(taskResult).length > 0) {
        record.taskResults[taskCode] = taskResult;
      }
    }
  }

  private extractTaskResultOnFinish(id: string, taskCode: string): void {
    const record = this.flows.get(id);
    if (!record) return;

    if (!record.taskResults) {
      record.taskResults = {};
    }

    const flow = this.flowInstances.get(id);
    if (!flow) return;

    try {
      const serializableState = flow.getSerializableState();
      const flowResults = serializableState?.results as ValueMap | undefined;

      const tasks = (record.dag as Record<string, unknown>).tasks as
        | Record<string, { resolver?: { results?: Record<string, string> } }>
        | undefined;

      const resultMapping = tasks?.[taskCode]?.resolver?.results;
      if (resultMapping && flowResults) {
        const taskResult: ValueMap = {};
        for (const [resolverKey, flowKey] of Object.entries(resultMapping)) {
          if (flowResults[flowKey] !== undefined) {
            taskResult[resolverKey] = flowResults[flowKey];
          }
        }
        if (Object.keys(taskResult).length > 0) {
          record.taskResults[taskCode] = taskResult;
        }
      }
    } catch {
      // ignore extraction errors
    }
  }

  private finalizeFlow(id: string): void {
    const record = this.flows.get(id);
    if (!record) return;

    const currentStates = record.taskStates;

    if (record.state === "FAILED" || record.state === "STOPPED") {
      for (const code of Object.keys(currentStates)) {
        if (currentStates[code] === "PENDING") {
          currentStates[code] = "SKIPPED";
        }
      }
    }

    if (record.phase === "error") {
      record.errorTaskStates = { ...currentStates };
      record.taskStates = record.mainTaskStates ?? {};
    }

    record.finishedAt = record.finishedAt ?? nowISO();

    const flow = this.flowInstances.get(id);
    if (flow) {
      try {
        if (record.phase === "error") {
          record.serializedErrorRunStatus = flow.getSerializableState();
        } else {
          record.serializedRunStatus = flow.getSerializableState();
        }
      } catch {
        // ignore
      }
    }

    this.saveFlow(record).catch((err: unknown) => { log.warn({ flowId: record.id, err }, 'Failed to persist flow on finalize'); });
    this.emitFlowUpdated(record);
    this.emitFlowCompleted(record);

    const startedAt = record.startedAt ?? record.createdAt;
    const durationMs = Math.max(0, new Date(record.finishedAt).getTime() - new Date(startedAt).getTime());
    log.info({ flowId: record.id, state: record.state, phase: record.phase, durationMs }, 'Flow execution finished');
  }

  async pauseFlow(id: string): Promise<void> {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) throw new Error("Flow not found");
    if (record.state !== "RUNNING") return;

    await flow.pause();
    record.state = "PAUSED";
    try {
      if (record.phase === "error") {
        record.serializedErrorRunStatus = flow.getSerializableState();
      } else {
        record.serializedRunStatus = flow.getSerializableState();
      }
    } catch {
      // ignore
    }
    await this.saveFlow(record);
    this.emitFlowUpdated(record);

    log.info({ flowId: id }, 'Flow paused');
  }

  async resumeFlow(id: string): Promise<void> {
    const record = this.flows.get(id);
    const flow = this.flowInstances.get(id);
    if (!record || !flow) throw new Error("Flow not found");
    if (record.state !== "PAUSED") return;

    record.state = "RUNNING";
    this.saveFlow(record).catch((err: unknown) => { log.warn({ flowId: record.id, err }, 'Failed to persist flow on resume'); });
    this.emitFlowUpdated(record);

    log.info({ flowId: id, phase: record.phase }, 'Flow resumed');

    const isErrorPhase = record.phase === "error";
    const currentDag = isErrorPhase ? (record.errorDag ?? record.dag) : record.dag;

    flow
      .resume()
      .then((flowResults: ValueMap) => {
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          if (isErrorPhase) {
            record.state = "FAILED";
          } else {
            record.state = "COMPLETED";
          }
        }
        if (flowResults && Object.keys(flowResults).length > 0) {
          record.results = {};
          for (const key of record.expectedResults ?? []) {
            if (flowResults[key] !== undefined) {
              (record.results as ValueMap)[key] = flowResults[key];
            }
          }
          this.extractTaskResults(id, flowResults);
        }
        if (isErrorPhase) {
          this.emitErrorHandlingCompleted(record);
        }
        this.finalizeFlow(id);
      })
      .catch((err: unknown) => {
        log.error({ flowId: id, err: err instanceof Error ? err.message : String(err) }, 'Flow failed on resume');
        if (record.state !== "STOPPED" && record.state !== "PAUSED") {
          record.state = "FAILED";
        }
        if (isErrorPhase) {
          this.emitErrorHandlingCompleted(record);
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

    log.info({ flowId: id }, 'Flow stopped');

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

    log.info({ flowId: id, type: record.type }, 'Flow deleted');

    this.emitFlowRemoved(id);
  }

  async retryFlow(id: string): Promise<FlowSummary> {
    const record = this.flows.get(id);
    if (!record) throw new Error("Flow not found");

    if (record.state === "RUNNING" || record.state === "PAUSED") {
      throw new Error("Cannot retry a running or paused flow");
    }

    const taskCodes = getTaskCodes(record.dag);
    const taskStates: Record<string, TaskState> = {};
    for (const code of taskCodes) {
      taskStates[code] = "PENDING";
    }

    record.state = "PENDING";
    record.taskStates = taskStates;
    record.taskResults = {};
    record.results = undefined;
    record.finishedAt = undefined;
    record.startedAt = undefined;
    record.errorContext = undefined;
    record.mainTaskStates = undefined;
    record.errorTaskStates = undefined;
    record.phase = "main";
    record.serializedRunStatus = undefined;
    record.serializedErrorRunStatus = undefined;

    const flow = new Flow(record.dag);
    this.flowInstances.set(id, flow);

    await this.saveFlow(record);
    this.emitFlowUpdated(record);

    log.info({ flowId: id, type: record.type }, 'Flow retried');

    this.startFlow(id);

    return this.summarize(record);
  }

  getFlow(id: string): FlowSummary | undefined {
    const record = this.flows.get(id);
    return record ? this.summarize(record) : undefined;
  }

  listFlows(filterType?: FlowType, filterParams?: Record<string, string>): FlowSummary[] {
    const results: FlowSummary[] = [];
    for (const record of this.flows.values()) {
      if (filterType && record.type !== filterType) continue;
      if (filterParams) {
        let match = true;
        for (const [key, value] of Object.entries(filterParams)) {
          if (String(record.input?.[key] ?? "") !== value) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }
      results.push(this.summarize(record));
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
        const isErrorPhase = record.phase === "error";
        const dag = isErrorPhase ? (record.errorDag ?? record.dag) : record.dag;

        if (record.state === "RUNNING") {
          record.state = "PENDING";
          record.startedAt = undefined;
          if (isErrorPhase) {
            record.serializedErrorRunStatus = undefined;
          } else {
            record.serializedRunStatus = undefined;
          }
          const flow = new Flow(dag);
          this.flows.set(record.id, record);
          this.flowInstances.set(record.id, flow);
          await this.saveFlow(record).catch(() => {});
          log.info({ flowId: record.id, type: record.type }, 'Flow loaded from persistence as PENDING');
          continue;
        }

        const runStatus = isErrorPhase ? record.serializedErrorRunStatus : record.serializedRunStatus;
        const flow = new Flow(dag, runStatus);
        this.flows.set(record.id, record);
        this.flowInstances.set(record.id, flow);

        log.info({ flowId: record.id, state: record.state, type: record.type }, 'Flow loaded from persistence');
      } catch (err) {
        log.error({ flowFileName: child.name, err: err instanceof Error ? err.message : String(err) }, 'Failed to load flow');
      }
    }
  }

  private async saveFlow(record: FlowRecord): Promise<void> {
    if (record.type === "internal") return;
    const flow = this.flowInstances.get(record.id);
    let serializedRunStatus = record.serializedRunStatus;
    if (flow) {
      try {
        serializedRunStatus = flow.getSerializableState();
      } catch {
        // flow in Running state does not support serialization
      }
    }
    const payload: FlowRecord = {
      ...record,
      serializedRunStatus,
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
        log.debug({ flowId, taskCode }, 'Task started');
        this.emitTaskUpdated(flowId, taskCode, "RUNNING");
      }
    } else if (entry.eventType === "Task.Finished") {
      const taskCode = (entry.extra?.task as { code?: string } | undefined)?.code;
      if (taskCode) {
        const isError = entry.level === "error";
        record.taskStates[taskCode] = isError ? "FAILED" : "COMPLETED";

        if (!isError) {
          this.extractTaskResultOnFinish(flowId, taskCode);
        }

        log.debug({ flowId, taskCode, state: record.taskStates[taskCode] }, 'Task finished');

        this.emitTaskUpdated(flowId, taskCode, record.taskStates[taskCode]);

        if (!isError && record.taskResults?.[taskCode]) {
          this.emitTaskResult(flowId, taskCode, record.taskResults[taskCode]);
        }
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
      this.saveFlow(record).catch((err: unknown) => { log.warn({ flowId: record.id, err }, 'Failed to persist flow on task event'); });
      this.emitFlowUpdated(record);
    }
  }

  private summarize(record: FlowRecord): FlowSummary {
    return {
      id: record.id,
      type: record.type,
      state: record.state,
      taskStates: { ...record.taskStates },
      taskResults: record.taskResults ? { ...record.taskResults } : undefined,
      results: record.results,
      input: record.input,
      expectedResults: record.expectedResults,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      errorDag: record.errorDag,
      phase: record.phase,
    };
  }
}
