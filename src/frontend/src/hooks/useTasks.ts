import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  listFlows,
  createFlow,
  pauseFlow,
  resumeFlow,
  stopFlow,
  deleteFlow,
  batchPause,
  batchResume,
  batchStop,
  batchDelete,
  subscribeTaskEvents,
} from "../api/taskApi.js";
import { listRobots } from "../api/robotApi.js";
import type { StoredRobotData } from "../types/robot.js";
import type { FlowSummary } from "../types/task.js";
import {
  computeResultSummary,
  computeElapsedTime,
  resolveRobotAliases,
  type TaskDefinition,
  type TaskTypeDescriptor,
} from "../types/task.js";
import { getDagConfig } from "../types/taskDag.js";

const POLL_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1_000;

export function useTasks(solutionId: string | null) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [robotMap, setRobotMap] = useState<Map<string, string>>(new Map());
  const robotDataRef = useRef<StoredRobotData[]>([]);
  const [tick, setTick] = useState(0);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const createdFlowIdsRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const hasRunning = flows.some((f) => f.state === "RUNNING");
    if (!hasRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flows]);

  useEffect(() => {
    if (!solutionId) {
      setFlows([]);
      setLoading(false);
      setError(null);
      setRobotMap(new Map());
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [robotData, flowData] = await Promise.all([
          listRobots(solutionId).catch(() => [] as StoredRobotData[]),
          listFlows("user", { solutionId }),
        ]);

        if (!cancelled) {
          const map = new Map<string, string>();
          for (const r of robotData) {
            map.set(r.id, r.alias);
          }
          setRobotMap(map);
          robotDataRef.current = robotData;
          setFlows(flowData);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    const unsubSse = subscribeTaskEvents((eventType, data) => {
      if (cancelled) return;
      const flowId = (data.flowId as string) ?? (data.id as string);
      if (!flowId) return;

      if (
        eventType === "task-flow-engine/flow-updated" ||
        eventType === "task-flow-engine/flow-completed" ||
        eventType === "task-flow-engine/error-handling-started" ||
        eventType === "task-flow-engine/error-handling-completed"
      ) {
        if (pendingRef.current.has(flowId)) {
          pendingRef.current.delete(flowId);
          setPendingActions(new Set(pendingRef.current));
        }
      }

      setFlows((prev) => {
        if (eventType === "task-flow-engine/flow-removed") {
          createdFlowIdsRef.current.delete(flowId);
          return prev.filter((f) => f.id !== flowId);
        }

        const index = prev.findIndex((f) => f.id === flowId);
        if (index === -1) {
          if (
            (eventType === "task-flow-engine/flow-created" ||
              eventType === "task-flow-engine/flow-current") &&
            !createdFlowIdsRef.current.has(flowId)
          ) {
            const newFlow = data as unknown as FlowSummary;
            if (newFlow.id && newFlow.type === "user") {
              const inputSol = newFlow.input?.solutionId;
              if (String(inputSol ?? "") === solutionId) {
                return [newFlow, ...prev];
              }
            }
          }
          return prev;
        }
        createdFlowIdsRef.current.delete(flowId);
        const updated = { ...prev[index], ...(data as Partial<FlowSummary>) };
        const next = [...prev];
        next[index] = updated;
        return next;
      });
    });

    pollRef.current = setInterval(async () => {
      if (cancelled) return;
      try {
        const data = await listFlows("user", { solutionId });
        if (!cancelled) {
          setFlows(data);
          pendingRef.current.clear();
          setPendingActions(new Set());
        }
      } catch {
        // silent poll failure
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      unsubSse();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [solutionId]);

  const tasks: TaskDefinition[] = useMemo(
    () =>
      flows.map((f) => ({
        id: f.id,
        type: f.type,
        state: f.state,
        robotAliases: resolveRobotAliases(f.input?.robotIds, robotMap),
        taskName: String(f.input?.taskName ?? f.id.slice(0, 8)),
        resultSummary: computeResultSummary(f.taskStates),
        elapsedTime: computeElapsedTime(f.startedAt, f.finishedAt),
        createdAt: f.createdAt,
        startedAt: f.startedAt,
        finishedAt: f.finishedAt,
        taskStates: f.taskStates,
        input: f.input,
      })),
    [flows, robotMap, tick]
  );

  const createTask = useCallback(
    async (
      robotIds: string[],
      taskType: TaskTypeDescriptor,
      params: Record<string, string>
    ): Promise<TaskDefinition> => {
      if (!solutionId) throw new Error("No active solution");

      const robotAddr = robotDataRef.current.find((r) => r.id === robotIds[0]);
      const robotIp = robotAddr?.address;
      const robotPort = robotAddr?.port ?? 22;

      const input: Record<string, unknown> = {
        solutionId,
        robotIds,
        taskName: taskType.name,
        robotIp,
        robotPort,
        ...params,
      };

      const dagConfig = getDagConfig(taskType.type);
      const dag = dagConfig.dag as unknown as Record<string, unknown>;
      const { expectedResults } = dagConfig;
      const errorDag = dagConfig.errorDag as unknown as Record<string, unknown> | undefined;

      const summary = await createFlow({
        type: "user",
        dag,
        input,
        expectedResults,
        errorDag,
      });

      setFlows((prev) => {
        const exists = prev.some((f) => f.id === summary.id);
        if (exists) return prev;
        return [summary, ...prev];
      });

      createdFlowIdsRef.current.add(summary.id);

      const taskDef: TaskDefinition = {
        id: summary.id,
        type: summary.type,
        state: summary.state,
        robotAliases: resolveRobotAliases(robotIds, robotMap),
        taskName: taskType.name,
        resultSummary: computeResultSummary(summary.taskStates),
        elapsedTime: computeElapsedTime(summary.startedAt, summary.finishedAt),
        createdAt: summary.createdAt,
        startedAt: summary.startedAt,
        finishedAt: summary.finishedAt,
        taskStates: summary.taskStates,
        input: summary.input,
      };

      return taskDef;
    },
    [solutionId, robotMap]
  );

  const handlePause = useCallback(async (id: string) => {
    pendingRef.current.add(id);
    setPendingActions(new Set(pendingRef.current));
    try {
      await pauseFlow(id);
    } catch {
      pendingRef.current.delete(id);
      setPendingActions(new Set(pendingRef.current));
    }
  }, []);

  const handleResume = useCallback(async (id: string) => {
    pendingRef.current.add(id);
    setPendingActions(new Set(pendingRef.current));
    try {
      await resumeFlow(id);
    } catch {
      pendingRef.current.delete(id);
      setPendingActions(new Set(pendingRef.current));
    }
  }, []);

  const handleStop = useCallback(async (id: string) => {
    pendingRef.current.add(id);
    setPendingActions(new Set(pendingRef.current));
    try {
      await stopFlow(id);
    } catch {
      pendingRef.current.delete(id);
      setPendingActions(new Set(pendingRef.current));
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setFlows((prev) => prev.filter((f) => f.id !== id));
    await deleteFlow(id);
  }, []);

  const handleBatchPause = useCallback(async (ids: string[]) => {
    for (const id of ids) pendingRef.current.add(id);
    setPendingActions(new Set(pendingRef.current));
    try {
      await batchPause(ids);
    } catch {
      for (const id of ids) pendingRef.current.delete(id);
      setPendingActions(new Set(pendingRef.current));
    }
  }, []);

  const handleBatchResume = useCallback(async (ids: string[]) => {
    for (const id of ids) pendingRef.current.add(id);
    setPendingActions(new Set(pendingRef.current));
    try {
      await batchResume(ids);
    } catch {
      for (const id of ids) pendingRef.current.delete(id);
      setPendingActions(new Set(pendingRef.current));
    }
  }, []);

  const handleBatchStop = useCallback(async (ids: string[]) => {
    for (const id of ids) pendingRef.current.add(id);
    setPendingActions(new Set(pendingRef.current));
    try {
      await batchStop(ids);
    } catch {
      for (const id of ids) pendingRef.current.delete(id);
      setPendingActions(new Set(pendingRef.current));
    }
  }, []);

  const handleBatchDelete = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    setFlows((prev) => prev.filter((f) => !idSet.has(f.id)));
    await batchDelete(ids);
  }, []);

  return {
    tasks,
    loading,
    error,
    pendingActions,
    createTask,
    pauseTask: handlePause,
    resumeTask: handleResume,
    stopTask: handleStop,
    deleteTask: handleDelete,
    batchPauseTasks: handleBatchPause,
    batchResumeTasks: handleBatchResume,
    batchStopTasks: handleBatchStop,
    batchDeleteTasks: handleBatchDelete,
  };
}
