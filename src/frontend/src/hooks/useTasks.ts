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

const POLL_INTERVAL_MS = 10_000;

export function useTasks(solutionId: string | null) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [robotMap, setRobotMap] = useState<Map<string, string>>(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    const unsubSse = subscribeTaskEvents((_event, data) => {
      if (cancelled) return;
      const flowId = data.flowId as string | undefined;
      if (!flowId) return;

      setFlows((prev) => {
        const index = prev.findIndex((f) => f.id === flowId);
        if (index === -1) {
          const newFlow = data as unknown as FlowSummary;
          if (newFlow.id && newFlow.type === "user") {
            const inputSol = newFlow.input?.solutionId;
            if (String(inputSol ?? "") === solutionId) {
              return [newFlow, ...prev];
            }
          }
          return prev;
        }
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
    [flows, robotMap]
  );

  const createTask = useCallback(
    async (
      robotIds: string[],
      taskType: TaskTypeDescriptor,
      params: Record<string, string>
    ): Promise<TaskDefinition> => {
      if (!solutionId) throw new Error("No active solution");

      const input: Record<string, unknown> = {
        solutionId,
        robotIds,
        taskName: taskType.name,
        ...params,
      };

      const dag = {
        tasks: {
          upgrade: {
            resolver: {
              name: "SshFileTransferTask",
              results: { done: "upgrade_result" },
            },
            provides: ["upgrade_result"],
          },
        },
      };

      const summary = await createFlow({
        type: "user",
        dag,
        input,
        expectedResults: ["upgrade_result"],
      });

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
    await pauseFlow(id);
  }, []);

  const handleResume = useCallback(async (id: string) => {
    await resumeFlow(id);
  }, []);

  const handleStop = useCallback(async (id: string) => {
    await stopFlow(id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteFlow(id);
  }, []);

  const handleBatchPause = useCallback(async (ids: string[]) => {
    await batchPause(ids);
  }, []);

  const handleBatchResume = useCallback(async (ids: string[]) => {
    await batchResume(ids);
  }, []);

  const handleBatchStop = useCallback(async (ids: string[]) => {
    await batchStop(ids);
  }, []);

  const handleBatchDelete = useCallback(async (ids: string[]) => {
    await batchDelete(ids);
  }, []);

  return {
    tasks,
    loading,
    error,
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
