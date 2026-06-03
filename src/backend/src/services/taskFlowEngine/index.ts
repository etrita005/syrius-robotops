import { TaskFlowEngine } from "./taskFlowEngine.js";
export { TaskFlowEngine } from "./taskFlowEngine.js";
export type { FlowType, FlowState, TaskState, FlowRecord, FlowSummary, TaskFlowEngineOptions } from "./taskFlowEngine.js";
export { ResolverRegistry } from "./resolverRegistry.js";
export { SseManager } from "./sseManager.js";
export type { SSEClient } from "./sseManager.js";

let engineInstance: TaskFlowEngine | null = null;

export function setTaskFlowEngine(engine: TaskFlowEngine): void {
  engineInstance = engine;
}

export function getTaskFlowEngine(): TaskFlowEngine {
  if (!engineInstance) throw new Error("TaskFlowEngine not initialized");
  return engineInstance;
}
