export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogFileInfo {
  name: string;
  size: number;
  mtime: string;
  firstTs?: string;
  lastTs?: string;
  isActive: boolean;
}

export interface LogEntry {
  time: string;
  level: LogLevel;
  module?: string;
  msg: string;
  extra: Record<string, unknown>;
  raw?: string;
}

export interface LogQueryRequest {
  from?: string;
  to?: string;
  levels?: LogLevel[];
  modules?: string[];
  q?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

export interface LogQueryResponse {
  entries: LogEntry[];
  nextCursor?: string;
  truncated: boolean;
  parseErrorCount: number;
}

export interface LogBundleRequest {
  from: string;
  to: string;
}
