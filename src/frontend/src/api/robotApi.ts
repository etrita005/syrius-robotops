import { listObjects, getObject, putObject, deleteObject } from "./objectStoreApi.js";
import {
  StoredRobotData,
  CreateRobotInput,
  createStoredRobotData,
  enrichRobot,
  generateRobotId,
} from "../types/robot.js";

export async function listRobots(solutionId: string): Promise<StoredRobotData[]> {
  const resources = await listObjects(`v1/solutions/${solutionId}/robots`);
  const robots: StoredRobotData[] = [];
  for (const res of resources) {
    if (res.type === "file" && res.name !== "_keep") {
      const stored = await getObject<StoredRobotData>(`v1/solutions/${solutionId}/robots/${res.name}`);
      if (stored) robots.push(stored);
    }
  }
  return robots;
}

export async function getRobot(solutionId: string, robotId: string): Promise<StoredRobotData | null> {
  return getObject<StoredRobotData>(`v1/solutions/${solutionId}/robots/${robotId}`);
}

export async function createRobot(solutionId: string, input: CreateRobotInput): Promise<StoredRobotData> {
  const id = generateRobotId();
  const stored = createStoredRobotData(input, id);
  await putObject(`v1/solutions/${solutionId}/robots/${id}`, stored);
  return stored;
}

export async function updateRobot(
  solutionId: string,
  robotId: string,
  patch: Partial<Pick<StoredRobotData, "alias" | "address">>
): Promise<StoredRobotData> {
  const current = await getRobot(solutionId, robotId);
  if (!current) throw new Error(`Robot '${robotId}' not found`);

  const updated: StoredRobotData = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await putObject(`v1/solutions/${solutionId}/robots/${robotId}`, updated);
  return updated;
}

export async function deleteRobot(solutionId: string, robotId: string): Promise<void> {
  await deleteObject(`v1/solutions/${solutionId}/robots/${robotId}`);
}
