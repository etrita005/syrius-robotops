import { get, post, del } from "./client.js";
import {
  subscribeMemStoreKey as subscribeSharedMemStoreKey,
  type MemStoreSseEventData,
} from "./sseClient.js";
import {
  StoredRobotData,
  CreateRobotInput,
  RobotWithBasicInfoResponse,
} from "../types/robot.js";

const ROBOT_MEMSTORE_KEY_PREFIX = "robot:";

export function buildRobotMemStoreKey(solutionId: string, robotId: string): string {
  return `${ROBOT_MEMSTORE_KEY_PREFIX}${solutionId}/${robotId}`;
}

export function buildRobotSoftwareMemStoreKey(solutionId: string, robotId: string): string {
  return `${buildRobotMemStoreKey(solutionId, robotId)}/sw`;
}

export async function listRobots(solutionId: string): Promise<StoredRobotData[]> {
  return get<StoredRobotData[]>(`/solutions/${solutionId}/robots`);
}

export async function fetchRobotsInfo(solutionId: string): Promise<RobotWithBasicInfoResponse[]> {
  return get<RobotWithBasicInfoResponse[]>(`/solutions/${solutionId}/robots/info`);
}

export async function fetchRobotInfo(solutionId: string, robotId: string): Promise<RobotWithBasicInfoResponse> {
  return get<RobotWithBasicInfoResponse>(`/solutions/${solutionId}/robots/info/${robotId}`);
}

export async function getRobot(solutionId: string, robotId: string): Promise<StoredRobotData> {
  return get<StoredRobotData>(`/solutions/${solutionId}/robots/${robotId}`);
}

export async function createRobot(solutionId: string, input: CreateRobotInput): Promise<StoredRobotData> {
  return post<StoredRobotData>(`/solutions/${solutionId}/robots`, input);
}

export async function updateRobot(
  solutionId: string,
  robotId: string,
  patch: Partial<Pick<StoredRobotData, "alias" | "address" | "port">>
): Promise<StoredRobotData> {
  const { put } = await import("./client.js");
  return put<StoredRobotData>(`/solutions/${solutionId}/robots/${robotId}`, patch);
}

export async function deleteRobot(solutionId: string, robotId: string): Promise<void> {
  await del<{ ok: boolean }>(`/solutions/${solutionId}/robots/${robotId}`);
}

export interface MemStoreCacheDetail {
  key: string;
  value: unknown;
  properties: Record<string, unknown>;
}

export async function getMemStoreValue(key: string): Promise<MemStoreCacheDetail | null> {
  try {
    const result = await get<MemStoreCacheDetail>(`/memstore/cache?key=${encodeURIComponent(key)}`);
    return result;
  } catch {
    return null;
  }
}

export async function getMemStoreCacheDetail(key: string): Promise<{
  key: string;
  value: unknown;
  hasValue: boolean;
  properties: Record<string, unknown>;
  context: Record<string, unknown>;
} | null> {
  try {
    const result = await get<{
      key: string;
      value: unknown;
      hasValue: boolean;
      properties: Record<string, unknown>;
      context: Record<string, unknown>;
    }>(`/memstore/cache/detail?key=${encodeURIComponent(key)}`);
    return result;
  } catch {
    return null;
  }
}

export async function memStoreCacheExists(key: string): Promise<boolean> {
  try {
    const result = await get<{ key: string; exists: boolean }>(`/memstore/cache/exists?key=${encodeURIComponent(key)}`);
    return result.exists;
  } catch {
    return false;
  }
}

export async function refreshMemStoreKey(key: string): Promise<boolean> {
  try {
    await post<{ success: boolean; key: string }>(`/memstore/cache/refresh?key=${encodeURIComponent(key)}`);
    return true;
  } catch {
    return false;
  }
}

export async function queryMemStoreCaches(properties?: Record<string, unknown>): Promise<{
  key: string;
  value: unknown;
  hasValue: boolean;
  properties: Record<string, unknown>;
}[]> {
  try {
    const result = await post<{
      caches: {
        key: string;
        value: unknown;
        hasValue: boolean;
        properties: Record<string, unknown>;
      }[];
    }>("/memstore/caches/query", { properties });
    return result.caches;
  } catch {
    return [];
  }
}

export function subscribeMemStoreKey(
  key: string,
  onData: (data: MemStoreSseEventData) => void
): () => void {
  return subscribeSharedMemStoreKey(key, onData);
}
