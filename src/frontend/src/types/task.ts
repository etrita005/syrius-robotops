export type FlowType = "internal" | "user";

export type FlowState = "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "STOPPED";

export type TaskState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

export type FlowPhase = "main" | "error";

export interface FlowSummary {
  id: string;
  type: FlowType;
  state: FlowState;
  taskStates: Record<string, TaskState>;
  taskResults?: Record<string, Record<string, unknown>>;
  results?: Record<string, unknown>;
  input?: Record<string, unknown>;
  expectedResults?: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorDag?: Record<string, unknown>;
  phase?: FlowPhase;
}

export interface TaskDefinition {
  id: string;
  type: FlowType;
  state: FlowState;
  robotAliases: string[];
  taskName: string;
  resultSummary: string;
  elapsedTime: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  taskStates: Record<string, TaskState>;
  input?: Record<string, unknown>;
}

export interface TaskTypeDescriptor {
  type: string;
  name: string;
  description: string;
  params: Record<string, TaskParamDescriptor>;
}

export interface TaskParamDescriptor {
  type: "artifact" | "text" | "number" | "select";
  label: string;
  required: boolean;
  options?: string[];
}

export const TASK_TYPES: TaskTypeDescriptor[] = [
  {
    type: "upgrade-bup",
    name: "Upgrade BUP",
    description: "Upgrade the BUP firmware on selected robots.",
    params: {
      artifactId: { type: "artifact", label: "Artifact file", required: true },
    },
  },
  {
    type: "upgrade-movebase",
    name: "Upgrade Movebase",
    description: "Upgrade the Movebase software on selected robots.",
    params: {
      artifactId: { type: "artifact", label: "Artifact file", required: true },
    },
  },
];

export function computeResultSummary(taskStates: Record<string, TaskState>): string {
  const values = Object.values(taskStates);
  if (values.length === 0) return "No tasks";

  const total = values.length;
  const completed = values.filter((s) => s === "COMPLETED").length;
  const failed = values.filter((s) => s === "FAILED").length;
  const running = values.filter((s) => s === "RUNNING").length;
  const pending = values.filter((s) => s === "PENDING").length;
  const skipped = values.filter((s) => s === "SKIPPED").length;

  if (running > 0) return "In progress";
  if (pending === total) return "Pending";
  if (completed === total) return "Success";
  if (failed === total) return "Failed";
  if (skipped === total) return "Skipped";

  const parts: string[] = [];
  if (completed > 0) parts.push(`${completed} completed`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (pending > 0) parts.push(`${pending} pending`);
  return parts.join(", ");
}

export function computeElapsedTime(startedAt?: string, finishedAt?: string): string {
  if (!startedAt) return "--:--:--";

  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);

  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function resolveRobotAliases(
  robotIds: unknown,
  robotMap: Map<string, string>
): string[] {
  if (!Array.isArray(robotIds)) return [];
  return robotIds.map((id: string) => robotMap.get(id) ?? id);
}
