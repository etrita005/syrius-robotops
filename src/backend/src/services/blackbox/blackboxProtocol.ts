export interface BlackboxProcessContext {
  name: string;
  contextTypes: Array<{ name: string }>;
}

export interface BlackboxTaskFinishedInfo {
  cloudTaskID: string;
  blackBoxTaskID: string;
}

export interface BlackboxResponsePayload {
  msg?: string;
  cloudTaskID?: string;
  taskInfo?: {
    blackBoxTaskID?: string;
  };
}

export function parseProcessList(input: string | string[] | undefined): string[] {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) {
    return input
      .map((name) => (typeof name === "string" ? name.trim() : ""))
      .filter((name) => name.length > 0);
  }
  return input
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export function buildCloudTaskId(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}${day}-${hour}${minute}`;
}

export function buildProcessList(processNames: string[]): BlackboxProcessContext[] {
  return processNames.map((name) => ({
    name,
    contextTypes: [{ name: "log" }],
  }));
}

export function buildRequestPayload(cloudTaskId: string, processNames: string[]): string {
  const task = {
    cloudTaskID: cloudTaskId,
    action: "createTask",
    processList: buildProcessList(processNames),
  };
  return JSON.stringify(task);
}

export function buildTopics(deviceId: string): {
  keepalive: string;
  request: string;
  response: string;
} {
  return {
    keepalive: `snapshot/blackbox/${deviceId}/keepalive`,
    request: `snapshot/blackbox/${deviceId}/request`,
    response: `snapshot/blackbox/${deviceId}/response`,
  };
}

function parseResponsePayload(payload: string): BlackboxResponsePayload | null {
  try {
    return JSON.parse(payload) as BlackboxResponsePayload;
  } catch {
    return null;
  }
}

export function isCreateTaskSucceeded(payload: string): boolean {
  const parsed = parseResponsePayload(payload);
  return parsed?.msg === "create task succeeded";
}

export function parseTaskFinishedMessage(payload: string): BlackboxTaskFinishedInfo | null {
  const parsed = parseResponsePayload(payload);
  if (!parsed || parsed.msg !== "taskFinished") return null;
  const cloudTaskID = parsed.cloudTaskID ?? "";
  const blackBoxTaskID = parsed.taskInfo?.blackBoxTaskID ?? "";
  return { cloudTaskID, blackBoxTaskID };
}

export function buildS3Url(bucket: string, deviceId: string, blackBoxTaskId: string): string {
  const objectKey = blackBoxTaskId.replace("_", `/${deviceId}/`);
  return `${bucket}${objectKey}.zip`;
}

export function buildS3Commands(
  profile: string,
  s3Url: string
): { s3LsCommand: string; s3CpCommand: string } {
  return {
    s3LsCommand: `aws s3 --profile ${profile} ls ${s3Url}`,
    s3CpCommand: `aws s3 --profile ${profile} cp ${s3Url} .`,
  };
}
