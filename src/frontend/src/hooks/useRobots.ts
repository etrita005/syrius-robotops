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
  const cancelledRef = useRef(false);

  const subscribeRobotSse = useCallback((solId: string, robot: RobotDefinition) => {
    const key = buildRobotMemStoreKey(solId, robot.id);
    const unsub = subscribeMemStoreKey(key, (data) => {
      if (cancelledRef.current) return;
      if ((data.type === "current" || data.type === "update") && data.value) {
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
  }, []);

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

    cancelledRef.current = false;

    const loadInitialData = async () => {
      try {
        const data = await fetchRobotsInfo(solutionId);
        if (!cancelledRef.current) {
          const enriched = data.map(enrichRobotFromBackend);
          setRobots(enriched);
          setLoading(false);
          initialLoadDone.current = true;

          sseUnsubscribers.current.forEach((unsub) => unsub());
          sseUnsubscribers.current = [];
          for (const robot of enriched) {
            subscribeRobotSse(solutionId, robot);
          }
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setError((err as Error).message);
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    };

    setLoading(true);
    setError(null);
    loadInitialData();

    const refreshInterval = setInterval(async () => {
      if (cancelledRef.current) return;
      try {
        const data = await fetchRobotsInfo(solutionId);
        if (!cancelledRef.current) {
          setRobots(data.map(enrichRobotFromBackend));
        }
      } catch {
        // silent refresh failure
      }
    }, INITIAL_LOAD_TIMEOUT_MS);

    return () => {
      cancelledRef.current = true;
      clearInterval(refreshInterval);
      sseUnsubscribers.current.forEach((unsub) => unsub());
      sseUnsubscribers.current = [];
    };
  }, [solutionId, subscribeRobotSse]);

  const addRobot = useCallback(
    async (input: CreateRobotInput) => {
      if (!solutionId) throw new Error("No active solution");
      const stored = await createRobot(solutionId, input);
      const robot = enrichRobot(stored);
      setRobots((prev) => [...prev, robot]);
      subscribeRobotSse(solutionId, robot);
      return robot;
    },
    [solutionId, subscribeRobotSse]
  );

  const editRobot = useCallback(
    async (robotId: string, patch: Partial<Pick<StoredRobotData, "alias" | "address" | "port">>) => {
      if (!solutionId) throw new Error("No active solution");
      const updated = await updateRobot(solutionId, robotId, patch);
      setRobots((prev) =>
        prev.map((r) => (r.id === robotId ? { ...r, ...updated } : r))
      );
      return enrichRobot(updated);
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
