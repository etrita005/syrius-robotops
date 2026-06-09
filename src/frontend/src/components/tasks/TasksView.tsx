import { useState, useMemo, useEffect } from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  TextInput,
  Pagination,
  Breadcrumb,
  BreadcrumbItem,
} from "@carbon/react";
import { useTasks } from "../../hooks/useTasks.js";
import { useActiveSolution } from "../../hooks/useActiveSolution.js";
import type { TaskDefinition, TaskTypeDescriptor } from "../../types/task.js";
import { TASK_TYPES } from "../../types/task.js";
import CreateTaskModal from "./CreateTaskModal.js";

interface TasksViewProps {
  solutionId: string;
  onBackToSolutions?: () => void;
}

const STATE_COLORS: Record<string, string> = {
  RUNNING: "#0f62fe",
  PAUSED: "#f1c21b",
  COMPLETED: "#24a148",
  FAILED: "#fa4d56",
  STOPPED: "#8d8d8d",
  PENDING: "#e0e0e0",
};

const STATE_TEXT_COLORS: Record<string, string> = {
  RUNNING: "white",
  PAUSED: "#161616",
  COMPLETED: "white",
  FAILED: "white",
  STOPPED: "white",
  PENDING: "#525252",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function TasksView({ solutionId, onBackToSolutions }: TasksViewProps) {
  const { activeMeta } = useActiveSolution();
  const {
    tasks,
    loading,
    error,
    pendingActions,
    createTask,
    pauseTask,
    resumeTask,
    stopTask,
    deleteTask,
    batchPauseTasks,
    batchResumeTasks,
    batchStopTasks,
    batchDeleteTasks,
  } = useTasks(solutionId);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskDefinition | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [notification, setNotification] = useState<{
    kind: "success" | "error" | "warning";
    title: string;
    subtitle?: string;
  } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return tasks;
    return tasks.filter(
      (t) =>
        t.robotAliases.some((a) => a.toLowerCase().includes(term)) ||
        t.taskName.toLowerCase().includes(term)
    );
  }, [tasks, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [filtered]);

  const paginatedItems = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelection = (taskId: string) => {
    const next = new Set(selectedIds);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    setSelectedIds(next);
  };

  const allSelected = paginatedItems.length > 0 && paginatedItems.every((t) => selectedIds.has(t.id));

  const selectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = new Set(paginatedItems.map((t) => t.id));
      const combined = new Set(selectedIds);
      for (const id of pageIds) combined.add(id);
      setSelectedIds(combined);
    } else {
      const pageIds = new Set(paginatedItems.map((t) => t.id));
      const next = new Set(selectedIds);
      for (const id of pageIds) next.delete(id);
      setSelectedIds(next);
    }
  };

  const getActionsForState = (state: string) => {
    switch (state) {
      case "RUNNING":
        return ["pause", "stop", "delete"];
      case "PAUSED":
        return ["resume", "stop", "delete"];
      case "PENDING":
        return ["stop", "delete"];
      default:
        return ["delete"];
    }
  };

  const handleAction = async (action: string, task: TaskDefinition) => {
    try {
      switch (action) {
        case "pause":
          await pauseTask(task.id);
          break;
        case "resume":
          await resumeTask(task.id);
          break;
        case "stop":
          await stopTask(task.id);
          break;
        case "delete":
          setDeleteTarget(task);
          setDeleteConfirmOpen(true);
          return;
      }
    } catch (err) {
      setNotification({
        kind: "error",
        title: `Failed to ${action}`,
        subtitle: (err as Error).message,
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask(deleteTarget.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setNotification({
        kind: "success",
        title: "Task deleted",
        subtitle: `Task ${deleteTarget.taskName} has been removed.`,
      });
    } catch (err) {
      setNotification({
        kind: "error",
        title: "Failed to delete task",
        subtitle: (err as Error).message,
      });
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleBatchAction = async (action: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      switch (action) {
        case "pause":
          await batchPauseTasks(ids);
          break;
        case "resume":
          await batchResumeTasks(ids);
          break;
        case "stop":
          await batchStopTasks(ids);
          break;
        case "delete":
          setBatchDeleteOpen(true);
          return;
      }
      setNotification({
        kind: "success",
        title: `Batch ${action} completed`,
        subtitle: `${ids.length} tasks ${action}d.`,
      });
    } catch (err) {
      setNotification({
        kind: "error",
        title: `Failed to batch ${action}`,
        subtitle: (err as Error).message,
      });
    }
  };

  const handleBatchDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await batchDeleteTasks(ids);
      setSelectedIds(new Set());
      setNotification({
        kind: "success",
        title: "Batch delete completed",
        subtitle: `${ids.length} tasks deleted.`,
      });
    } catch (err) {
      setNotification({
        kind: "error",
        title: "Failed to batch delete",
        subtitle: (err as Error).message,
      });
    } finally {
      setBatchDeleteOpen(false);
    }
  };

  const handleCreateTask = async (
    robotIds: string[],
    taskType: TaskTypeDescriptor,
    params: Record<string, string>
  ) => {
    const createdTasks = await createTask(robotIds, taskType, params);
    setCreateModalOpen(false);
    setNotification({
      kind: "success",
      title: "Tasks created",
      subtitle: `${createdTasks.length} ${taskType.name} task(s) for ${robotIds.length} robot(s).`,
    });
  };

  const renderStateTag = (state: string) => (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "0.75rem",
        fontWeight: 600,
        backgroundColor: STATE_COLORS[state] ?? "#e0e0e0",
        color: STATE_TEXT_COLORS[state] ?? "#161616",
        textTransform: "uppercase",
      }}
    >
      {state}
    </span>
  );

  const headers = [
    { key: "select", header: "" },
    { key: "robotAliases", header: "Robot Aliases" },
    { key: "taskName", header: "Task Name" },
    { key: "state", header: "State" },
    { key: "resultSummary", header: "Result" },
    { key: "elapsedTime", header: "Elapsed" },
    { key: "actions", header: "Actions" },
  ];

  const rows = paginatedItems.map((t) => ({
    id: t.id,
    select: (
      <input
        type="checkbox"
        checked={selectedIds.has(t.id)}
        onChange={() => toggleSelection(t.id)}
        aria-label={`Select ${t.taskName}`}
      />
    ),
    robotAliases: t.robotAliases.join(", ") || "--",
    taskName: t.taskName,
    state: renderStateTag(t.state),
    resultSummary: t.resultSummary,
    elapsedTime: t.elapsedTime,
    actions: (
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
        {getActionsForState(t.state).map((action) => {
          const isPending = pendingActions.has(t.id);
          return (
            <Button
              key={action}
              kind={action === "delete" ? "danger--ghost" : "ghost"}
              size="sm"
              disabled={isPending}
              onClick={() => handleAction(action, t)}
            >
              {isPending ? "..." : action.charAt(0).toUpperCase() + action.slice(1)}
            </Button>
          );
        })}
      </div>
    ),
  }));

  if (loading && tasks.length === 0) {
    return (
      <div style={{ padding: "2rem" }}>
        <InlineLoading description="Loading tasks..." />
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb style={{ marginBottom: "1rem" }}>
        <BreadcrumbItem>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onBackToSolutions?.();
            }}
            style={{ color: "#0f62fe", textDecoration: "none" }}
          >
            Solutions
          </a>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <span style={{ color: "#525252" }}>{activeMeta?.name ?? solutionId}</span>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>
          <span>Tasks</span>
        </BreadcrumbItem>
      </Breadcrumb>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3>Tasks</h3>
      </div>

      {notification && (
        <InlineNotification
          kind={notification.kind}
          title={notification.title}
          subtitle={notification.subtitle}
          onCloseButtonClick={() => setNotification(null)}
          style={{ marginBottom: "1rem" }}
        />
      )}
      {error && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={error}
          style={{ marginBottom: "1rem" }}
        />
      )}

      {tasks.length === 0 && !loading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem 2rem",
            gap: "1rem",
          }}
        >
          <p style={{ fontSize: "1.25rem", color: "#525252" }}>No tasks yet</p>
          <p style={{ color: "#6f6f6f" }}>
            Create tasks to upgrade robots in this solution.
          </p>
          <Button onClick={() => setCreateModalOpen(true)}>Create your first task</Button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "1rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <TextInput
              id="task-search"
              labelText=""
              hideLabel
              placeholder="Search by robot alias or task name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ minWidth: "300px" }}
            />
            <Button onClick={() => setCreateModalOpen(true)}>Create Task</Button>
            {selectedIds.size > 0 && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ padding: "0.5rem 0", color: "#525252", fontSize: "0.875rem" }}>
                  {selectedIds.size} selected
                </span>
                <Button kind="secondary" size="sm" onClick={() => handleBatchAction("pause")}>
                  Batch Pause
                </Button>
                <Button kind="secondary" size="sm" onClick={() => handleBatchAction("resume")}>
                  Batch Resume
                </Button>
                <Button kind="secondary" size="sm" onClick={() => handleBatchAction("stop")}>
                  Batch Stop
                </Button>
                <Button kind="danger" size="sm" onClick={() => handleBatchAction("delete")}>
                  Batch Delete
                </Button>
              </div>
            )}
          </div>

          <DataTable rows={rows} headers={headers}>
            {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {headers.map((h) => {
                      const { key, ...headerProps } = getHeaderProps({ header: h });
                      return (
                        <TableHeader key={key} {...headerProps}>
                          {h.key === "select" ? (
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={(e) => selectAll(e.target.checked)}
                              aria-label="Select all"
                            />
                          ) : (
                            h.header
                          )}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const { key, ...rowProps } = getRowProps({ row });
                    return (
                      <TableRow key={key} {...rowProps}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </DataTable>

          <div style={{ marginTop: "1rem" }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              pageSizes={PAGE_SIZE_OPTIONS}
              totalItems={sorted.length}
              onChange={({ page: newPage, pageSize: newSize }) => {
                if (newSize !== pageSize) {
                  setPageSize(newSize);
                  setPage(1);
                } else {
                  setPage(newPage);
                }
              }}
              size="md"
            />
          </div>
        </>
      )}

      <CreateTaskModal
        open={createModalOpen}
        solutionId={solutionId}
        taskTypes={TASK_TYPES}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateTask}
      />

      <Modal
        open={deleteConfirmOpen}
        modalHeading="Delete Task"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onRequestSubmit={handleDeleteConfirm}
        danger
      >
        <p>This action cannot be undone. The task record will be permanently removed.</p>
        {deleteTarget && (
          <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>
            {deleteTarget.taskName} ({deleteTarget.robotAliases.join(", ")})
          </p>
        )}
      </Modal>

      <Modal
        open={batchDeleteOpen}
        modalHeading={`Delete ${selectedIds.size} Tasks`}
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => setBatchDeleteOpen(false)}
        onRequestSubmit={handleBatchDeleteConfirm}
        danger
      >
        <p>
          This action cannot be undone. The selected task records will be permanently removed.
        </p>
      </Modal>
    </div>
  );
}
