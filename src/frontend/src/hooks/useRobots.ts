import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchRobotsInfo,
  createRobot,
  updateRobot,
  deleteRobot,
} from "../api/robotApi.js";
import {
  StoredRobotData,
  RobotDefinition,
  CreateRobotInput,
  enrichRobotFromBackend,
  enrichRobot,
} from "../types/robot.js";

const POLL_INTERVAL_MS = 10_000;

export function useRobots(solutionId: string | null) {
  const [robots, setRobots] = useState<RobotDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!solutionId) {
      setRobots([]);
      setLoading(false);
      setError(null);
      initialLoadDone.current = false;
      return;
    }

    let cancelled = false;
    let isFirstPoll = true;

    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await fetchRobotsInfo(solutionId);
        if (!cancelled) {
          setRobots(data.map(enrichRobotFromBackend));
          if (isFirstPoll) {
            setLoading(false);
            isFirstPoll = false;
            initialLoadDone.current = true;
          }
        }
      } catch (err) {
        if (!cancelled && isFirstPoll) {
          setError((err as Error).message);
          setLoading(false);
          isFirstPoll = false;
          initialLoadDone.current = true;
        }
      }
    };

    setLoading(true);
    setError(null);
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [solutionId]);

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
    async (robotId: string, patch: Partial<Pick<StoredRobotData, "alias" | "address" | "port">>) => {
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
    addRobot,
    editRobot,
    removeRobot,
    removeRobotsBatch,
  };
}
