import { useState, useEffect, useCallback } from "react";
import {
  listRobots,
  createRobot,
  updateRobot,
  deleteRobot,
} from "../api/robotApi.js";
import {
  StoredRobotData,
  RobotDefinition,
  CreateRobotInput,
  enrichRobot,
} from "../types/robot.js";

export function useRobots(solutionId: string | null) {
  const [robots, setRobots] = useState<RobotDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async () => {
      if (!solutionId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await listRobots(solutionId);
        setRobots(data.map(enrichRobot));
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
      const stored = await createRobot(solutionId, input);
      const robot = enrichRobot(stored);
      setRobots((prev) => [...prev, robot]);
      return robot;
    },
    [solutionId]
  );

  const editRobot = useCallback(
    async (robotId: string, patch: Partial<Pick<StoredRobotData, "alias" | "address">>) => {
      if (!solutionId) throw new Error("No active solution");
      const updated = await updateRobot(solutionId, robotId, patch);
      const enriched = enrichRobot(updated);
      setRobots((prev) => prev.map((r) => (r.id === robotId ? enriched : r)));
      return enriched;
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
      const succeeded: string[] = [];
      const failed: { robotId: string; reason: string }[] = [];

      for (const robotId of robotIds) {
        try {
          await deleteRobot(solutionId, robotId);
          succeeded.push(robotId);
        } catch (err) {
          failed.push({ robotId, reason: (err as Error).message });
        }
      }

      if (succeeded.length > 0) {
        setRobots((prev) => prev.filter((r) => !succeeded.includes(r.id)));
      }
      return { succeeded, failed };
    },
    [solutionId]
  );

  return {
    robots,
    loading,
    error,
    load,
    addRobot,
    editRobot,
    removeRobot,
    removeRobotsBatch,
  };
}
