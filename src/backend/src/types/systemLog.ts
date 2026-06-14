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

export interface LogBundleManifest {
  requestedFrom: string;
  requestedTo: string;
  generatedAt: string;
  studioVersion: string;
  files: Array<{
    name: string;
    size: number;
    mtime: string;
    firstTs?: string;
    lastTs?: string;
  }>;
}

export const LEVEL_MAP: Record<number, LogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

export const ALL_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export const RESERVED_PINO_FIELDS = new Set([
  "time", "level", "module", "msg", "name", "pid", "hostname", "v",
]);

export const SAFE_FILE_NAME_RE = /^app(?:\.\d+)?\.log$/;

export const KNOWN_MODULES = [
  "App",
  "TaskFlowEngine",
  "SseManager",
  "SseRoute",
  "SshConnectionWait",
  "SshCommandTask",
  "SshFileTransferTask",
  "GetRobotBasicInfoTask",
  "GetRobotSoftwareInfoTask",
  "UpdateRobotBasicInfoTask",
  "UpdateRobotSoftwareInfoTask",
  "UpgradeMovebaseTask",
  "TransferMovebaseTask",
  "DeleteMovebaseTask",
  "DeleteRemotePathTask",
  "RebootRobotTask",
  "MatchFileContentTask",
  "MatchMovebaseVersionTask",
  "TransferBUPTask",
  "TransferBUPScriptTask",
  "UpgradeBUPTask",
  "MatchBUPVersionTask",
  "DeleteBUPTask",
  "MovebaseDiskCleanupTask",
  "SleepTask",
  "WaitSshConnectedTask",
  "WaitSshDisconnectedTask",
  "WaitSshReconnectTask",
  "RobotService",
  "MemStore",
  "MemStoreScheduler",
  "SystemLog",
  "SystemLogRoute",
  "SystemLogService",
];
