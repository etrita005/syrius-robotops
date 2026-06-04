import { TaskFlowEngine } from "./taskFlowEngine.js";
export { TaskFlowEngine } from "./taskFlowEngine.js";
export type { FlowType, FlowState, TaskState, FlowRecord, FlowSummary, TaskFlowEngineOptions } from "./taskFlowEngine.js";
export { ResolverRegistry } from "./resolverRegistry.js";
export { UnifiedSseManager } from "../sseManager.js";
export type { SseClient, ServerEvent } from "../sseManager.js";

let engineInstance: TaskFlowEngine | null = null;

export function setTaskFlowEngine(engine: TaskFlowEngine): void {
  engineInstance = engine;
}

export function clearTaskFlowEngine(): void {
  engineInstance = null;
}

export function getTaskFlowEngine(): TaskFlowEngine {
  if (!engineInstance) throw new Error("TaskFlowEngine not initialized");
  return engineInstance;
}
