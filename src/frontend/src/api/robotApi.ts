import { get, post, put, del } from "./client.js";
import {
  StoredRobotData,
  CreateRobotInput,
  RobotWithBasicInfoResponse,
} from "../types/robot.js";

export async function listRobots(solutionId: string): Promise<StoredRobotData[]> {
  return get<StoredRobotData[]>(`/solutions/${solutionId}/robots`);
}

export async function fetchRobotsInfo(solutionId: string): Promise<RobotWithBasicInfoResponse[]> {
  return get<RobotWithBasicInfoResponse[]>(`/solutions/${solutionId}/robots/info`);
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
  return put<StoredRobotData>(`/solutions/${solutionId}/robots/${robotId}`, patch);
}

export async function deleteRobot(solutionId: string, robotId: string): Promise<void> {
  await del<{ ok: boolean }>(`/solutions/${solutionId}/robots/${robotId}`);
}
