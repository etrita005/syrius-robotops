import { get, post, del } from "./client.js";
import type { FlowSummary, FlowType } from "../types/task.js";

export interface CreateFlowInput {
  type: FlowType;
  dag: Record<string, unknown>;
  input: Record<string, unknown>;
  expectedResults?: string[];
  errorDag?: Record<string, unknown>;
}

export async function listFlows(
  type?: FlowType,
  filterParams?: Record<string, string>
): Promise<FlowSummary[]> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (filterParams) {
    for (const [key, value] of Object.entries(filterParams)) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return get<FlowSummary[]>(`/flows${qs ? `?${qs}` : ""}`);
}

export async function getFlow(id: string): Promise<FlowSummary> {
  return get<FlowSummary>(`/flows/${encodeURIComponent(id)}`);
}

export async function createFlow(input: CreateFlowInput): Promise<FlowSummary> {
  return post<FlowSummary>("/flows", input);
}

export async function pauseFlow(id: string): Promise<void> {
  await post<{ success: boolean }>(`/flows/${encodeURIComponent(id)}/pause`);
}

export async function resumeFlow(id: string): Promise<void> {
  await post<{ success: boolean }>(`/flows/${encodeURIComponent(id)}/resume`);
}

export async function stopFlow(id: string): Promise<void> {
  await post<{ success: boolean }>(`/flows/${encodeURIComponent(id)}/stop`);
}

export async function retryFlow(id: string): Promise<FlowSummary> {
  return post<FlowSummary>(`/flows/${encodeURIComponent(id)}/retry`);
}

export async function deleteFlow(id: string): Promise<void> {
  await del<{ success: boolean }>(`/flows/${encodeURIComponent(id)}`);
}

export async function batchPause(ids: string[]): Promise<void> {
  await post<{ success: boolean }>("/flows/batch/pause", { ids });
}

export async function batchResume(ids: string[]): Promise<void> {
  await post<{ success: boolean }>("/flows/batch/resume", { ids });
}

export async function batchStop(ids: string[]): Promise<void> {
  await post<{ success: boolean }>("/flows/batch/stop", { ids });
}

export async function batchDelete(ids: string[]): Promise<void> {
  await post<{ success: boolean }>("/flows/batch/delete", { ids });
}

export function subscribeTaskEvents(
  onEvent: (event: string, data: Record<string, unknown>) => void
): () => void {
  const eventSource = new EventSource("/api/sse");

  const handleMessage = (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.type === "ping") return;
      const payload = parsed.payload ?? parsed;
      onEvent(event.type === "message" ? "unknown" : event.type, payload);
    } catch {
      // ignore parse errors
    }
  };

  eventSource.addEventListener("task-flow-engine/flow-current", handleMessage);
  eventSource.addEventListener("task-flow-engine/flow-created", handleMessage);
  eventSource.addEventListener("task-flow-engine/flow-updated", handleMessage);
  eventSource.addEventListener("task-flow-engine/flow-completed", handleMessage);
  eventSource.addEventListener("task-flow-engine/flow-removed", handleMessage);
  eventSource.addEventListener("task-flow-engine/task-updated", handleMessage);
  eventSource.addEventListener("task-flow-engine/task-result", handleMessage);
  eventSource.addEventListener("task-flow-engine/error-handling-started", handleMessage);
  eventSource.addEventListener("task-flow-engine/error-handling-completed", handleMessage);

  return () => {
    eventSource.close();
  };
}
