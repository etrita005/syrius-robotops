import { get, post, put, del } from "./client.js";
import {
  RobotDefinition,
  CreateRobotInput,
  BatchCreateRobotResult,
  BatchDeleteRobotResult,
} from "../types/robot.js";

export interface RobotListOptions {
  filter?: {
    alias?: string;
    address?: string;
    model?: string;
    robotSN?: string;
  };
  sort?: {
    field: "alias" | "address" | "model" | "robotSN" | "createdAt";
    order: "asc" | "desc";
  };
}

export async function listRobots(
  solutionId: string,
  options?: RobotListOptions
): Promise<RobotDefinition[]> {
  const params = new URLSearchParams();
  if (options?.filter?.alias) params.set("filter[alias]", options.filter.alias);
  if (options?.filter?.address) params.set("filter[address]", options.filter.address);
  if (options?.filter?.model) params.set("filter[model]", options.filter.model);
  if (options?.filter?.robotSN) params.set("filter[robotSN]", options.filter.robotSN);
  if (options?.sort?.field) params.set("sort[field]", options.sort.field);
  if (options?.sort?.order) params.set("sort[order]", options.sort.order);

  const query = params.toString();
  const url = `/solutions/${solutionId}/robots${query ? `?${query}` : ""}`;
  return get<RobotDefinition[]>(url);
}

export async function getRobot(
  solutionId: string,
  robotId: string
): Promise<RobotDefinition> {
  return get<RobotDefinition>(`/solutions/${solutionId}/robots/${robotId}`);
}

export async function createRobot(
  solutionId: string,
  input: CreateRobotInput
): Promise<RobotDefinition> {
  return post<RobotDefinition>(`/solutions/${solutionId}/robots`, input);
}

export async function createRobotsBatch(
  solutionId: string,
  inputs: CreateRobotInput[]
): Promise<BatchCreateRobotResult> {
  return post<BatchCreateRobotResult>(`/solutions/${solutionId}/robots/batch`, { inputs });
}

export async function updateRobot(
  solutionId: string,
  robotId: string,
  patch: Partial<Omit<RobotDefinition, "id" | "createdAt">>
): Promise<RobotDefinition> {
  return put<RobotDefinition>(`/solutions/${solutionId}/robots/${robotId}`, patch);
}

export async function deleteRobot(solutionId: string, robotId: string): Promise<void> {
  return del<void>(`/solutions/${solutionId}/robots/${robotId}`);
}

export async function deleteRobotsBatch(
  solutionId: string,
  robotIds: string[]
): Promise<BatchDeleteRobotResult> {
  return post<BatchDeleteRobotResult>(`/solutions/${solutionId}/robots/batch-delete`, { robotIds });
}
