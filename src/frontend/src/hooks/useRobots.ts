import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchRobotsInfo,
  createRobot,
  updateRobot,
  deleteRobot,
  subscribeMemStoreKey,
  buildRobotMemStoreKey,
} from "../api/robotApi.js";
import {
  StoredRobotData,
  RobotDefinition,
  CreateRobotInput,
  enrichRobotFromBackend,
  enrichRobot,
  RobotWithBasicInfoResponse,
} from "../types/robot.js";

const INITIAL_LOAD_TIMEOUT_MS = 30_000;

export function useRobots(solutionId: string | null) {
  const [robots, setRobots] = useState<RobotDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);
  const sseUnsubscribers = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!solutionId) {
      setRobots([]);
      setLoading(false);
      setError(null);
      initialLoadDone.current = false;
      sseUnsubscribers.current.forEach((unsub) => unsub());
      sseUnsubscribers.current = [];
      return;
    }

    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const data = await fetchRobotsInfo(solutionId);
        if (!cancelled) {
          const enriched = data.map(enrichRobotFromBackend);
          setRobots(enriched);
          setLoading(false);
          initialLoadDone.current = true;

          subscribeToRobotUpdates(solutionId, enriched);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    };

    const subscribeToRobotUpdates = (solId: string, currentRobots: RobotDefinition[]) => {
      sseUnsubscribers.current.forEach((unsub) => unsub());
      sseUnsubscribers.current = [];

      for (const robot of currentRobots) {
        const key = buildRobotMemStoreKey(solId, robot.id);
        const unsub = subscribeMemStoreKey(key, (data) => {
          if (cancelled) return;
          if (data.type === "update" && data.value) {
            const updatedBasicInfo = data.value as RobotWithBasicInfoResponse["basicInfo"];
            setRobots((prev) =>
              prev.map((r) => {
                if (r.id !== robot.id) return r;
                return {
                  ...r,
                  model: updatedBasicInfo?.model ?? r.model,
                  robotSN: updatedBasicInfo?.robotSn ?? r.robotSN,
                  thingsId: updatedBasicInfo?.thingsId ?? r.thingsId,
                  vendorId: updatedBasicInfo?.vendorId ?? r.vendorId,
                  productId: updatedBasicInfo?.productId ?? r.productId,
                  mainboardSN: updatedBasicInfo?.mainBoardSn ?? r.mainboardSN,
                  mainboardId: updatedBasicInfo?.mainBoardId ?? r.mainboardId,
                  mainSOMSN: updatedBasicInfo?.mainSomSn ?? r.mainSOMSN,
                };
              })
            );
          } else if (data.type === "deleted") {
            setRobots((prev) => prev.filter((r) => r.id !== robot.id));
          }
        });
        sseUnsubscribers.current.push(unsub);
      }
    };

    setLoading(true);
    setError(null);
    loadInitialData();

    const refreshInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        const data = await fetchRobotsInfo(solutionId);
        if (!cancelled) {
          setRobots(data.map(enrichRobotFromBackend));
        }
      } catch {
        // silent refresh failure
      }
    }, INITIAL_LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
      sseUnsubscribers.current.forEach((unsub) => unsub());
      sseUnsubscribers.current = [];
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
