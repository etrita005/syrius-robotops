import { useState, useEffect, useCallback } from "react";
import {
  listRobots,
  createRobot,
  createRobotsBatch,
  updateRobot,
  deleteRobot,
  deleteRobotsBatch,
} from "../api/robotApi.js";
import {
  RobotDefinition,
  CreateRobotInput,
  BatchCreateRobotResult,
  BatchDeleteRobotResult,
} from "../types/robot.js";
import type { RobotListOptions } from "../api/robotApi.js";

export function useRobots(solutionId: string | null) {
  const [robots, setRobots] = useState<RobotDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (options?: RobotListOptions) => {
      if (!solutionId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await listRobots(solutionId, options);
        setRobots(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [solutionId]
  );

  useEffect(() => {
    if (solutionId) {
      load();
    } else {
      setRobots([]);
    }
  }, [solutionId, load]);

  const addRobot = useCallback(
    async (input: CreateRobotInput) => {
      if (!solutionId) throw new Error("No active solution");
      const robot = await createRobot(solutionId, input);
      setRobots((prev) => [...prev, robot]);
      return robot;
    },
    [solutionId]
  );

  const addRobotsBatch = useCallback(
    async (inputs: CreateRobotInput[]) => {
      if (!solutionId) throw new Error("No active solution");
      const result = await createRobotsBatch(solutionId, inputs);
      if (result.succeeded.length > 0) {
        setRobots((prev) => [...prev, ...result.succeeded]);
      }
      return result;
    },
    [solutionId]
  );

  const editRobot = useCallback(
    async (robotId: string, patch: Partial<Omit<RobotDefinition, "id" | "createdAt">>) => {
      if (!solutionId) throw new Error("No active solution");
      const updated = await updateRobot(solutionId, robotId, patch);
      setRobots((prev) => prev.map((r) => (r.id === robotId ? updated : r)));
      return updated;
    },
    [solutionId]
  );

  const removeRobot = useCallback(
    async (robotId: string) => {
      if (!solutionId) throw new Error("No active solution");
      await deleteRobot(solutionId, robotId);
      setRobots((prev) => prev.filter((r) => r.id !== robotId));
    },
    [solutionId]
  );

  const removeRobotsBatch = useCallback(
    async (robotIds: string[]) => {
      if (!solutionId) throw new Error("No active solution");
      const result = await deleteRobotsBatch(solutionId, robotIds);
      if (result.succeeded.length > 0) {
        setRobots((prev) => prev.filter((r) => !result.succeeded.includes(r.id)));
      }
      return result;
    },
    [solutionId]
  );

  return {
    robots,
    loading,
    error,
    load,
    addRobot,
    addRobotsBatch,
    editRobot,
    removeRobot,
    removeRobotsBatch,
  };
}
