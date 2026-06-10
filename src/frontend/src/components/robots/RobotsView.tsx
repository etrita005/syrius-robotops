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
  Modal,
  TextInput,
  Breadcrumb,
  BreadcrumbItem,
} from "@carbon/react";
import { Grid, List } from "@carbon/react/icons";
import { useRobots } from "../../hooks/useRobots.js";
import { RobotDefinition, formatAddressDisplay, formatInfoValue } from "../../types/robot.js";
import AddRobotModal from "./AddRobotModal.js";
import RobotDetailModal from "./RobotDetailModal.js";
import { useActiveSolution } from "../../hooks/useActiveSolution.js";
import { useThemeColor } from "../../hooks/useThemeColors.js";
import { useToast } from "../../hooks/useToast.js";

interface RobotsViewProps {
  solutionId: string;
  onBackToSolutions?: () => void;
}

type ViewMode = "grid" | "list";

const VIEW_MODE_KEY = "robotops_robots_view_mode";

function getStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "grid" || stored === "list") return stored;
  } catch {
    // ignore
  }
  return "grid";
}

function storeViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

export default function RobotsView({ solutionId, onBackToSolutions }: RobotsViewProps) {
  const { activeMeta } = useActiveSolution();
  const {
    robots,
    loading,
    error,
    addRobot,
    editRobot,
    removeRobot,
    removeRobotsBatch,
  } = useRobots(solutionId);

  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [detailRobotId, setDetailRobotId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RobotDefinition | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editingAliasValue, setEditingAliasValue] = useState("");
  const { showToast } = useToast();

  const bgCard = useThemeColor("white", "#262626");
  const borderCard = useThemeColor("#e0e0e0", "#393939");
  const bgOffline = useThemeColor("#e0e0e0", "#525252");
  const bgOfflineDot = useThemeColor("#8d8d8d", "#6f6f6f");
  const textSecondary = useThemeColor("#525252", "#c6c6c6");
  const textTertiary = useThemeColor("#6f6f6f", "#a8a8a8");

  useEffect(() => {
    if (error) {
      showToast("error", "Error", error, 0);
    }
  }, [error, showToast]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return robots;
    return robots.filter(
      (r) =>
        r.alias.toLowerCase().includes(term) ||
        formatAddressDisplay(r.address, r.port).toLowerCase().includes(term) ||
        r.model.toLowerCase().includes(term) ||
        r.robotSN.toLowerCase().includes(term)
    );
  }, [robots, search]);

  const handleToggleView = (mode: ViewMode) => {
    setViewMode(mode);
    storeViewMode(mode);
  };

  const toggleSelection = (robotId: string) => {
    const next = new Set(selectedIds);
    if (next.has(robotId)) next.delete(robotId);
    else next.add(robotId);
    setSelectedIds(next);
  };

  const selectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(filtered.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const detailRobot = useMemo(
    () => (detailRobotId ? robots.find((r) => r.id === detailRobotId) ?? null : null),
    [robots, detailRobotId]
  );

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const openDetail = (robot: RobotDefinition) => {
    setDetailRobotId(robot.id);
    setDetailOpen(true);
  };

  const handleAliasEditStart = (robot: RobotDefinition) => {
    setEditingAliasId(robot.id);
    setEditingAliasValue(robot.alias);
  };

  const handleAliasEditSave = async (robotId: string) => {
    if (editingAliasValue.trim()) {
      try {
        await editRobot(robotId, { alias: editingAliasValue.trim() });
      } catch (err) {
        showToast("error", "Failed to update alias", (err as Error).message, 0);
      }
    }
    setEditingAliasId(null);
    setEditingAliasValue("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeRobot(deleteTarget.id);
      showToast("success", "Robot deleted", `${deleteTarget.alias} has been removed.`);
    } catch (err) {
      showToast("error", "Failed to delete robot", (err as Error).message, 0);
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const result = await removeRobotsBatch(ids);
      showToast("success", "Batch delete completed", `${result.succeeded.length} deleted, ${result.failed.length} failed.`);
      setSelectedIds(new Set());
    } catch (err) {
      showToast("error", "Failed to batch delete", (err as Error).message, 0);
    } finally {
      setBatchDeleteOpen(false);
    }
  };

  // Grid view rendering
  const renderGridView = () => {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {filtered.map((robot) => (
          <div
            key={robot.id}
            style={{
              background: bgCard,
              border: `1px solid ${borderCard}`,
              borderRadius: "4px",
              padding: "1rem",
              cursor: "pointer",
              position: "relative",
              transition: "box-shadow 0.15s ease, transform 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (
                target.tagName === "INPUT" ||
                target.closest("input")
              ) {
                return;
              }
              openDetail(robot);
            }}
          >
            <div style={{ position: "absolute", top: 12, left: 12 }}>
              <input
                type="checkbox"
                checked={selectedIds.has(robot.id)}
                onChange={() => toggleSelection(robot.id)}
                aria-label={`Select ${robot.alias}`}
              />
            </div>
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: robot.online ? "#24a148" : bgOfflineDot,
                animation: robot.online ? "breathe 2s ease-in-out infinite" : undefined,
              }}
              title={robot.online ? "Online" : "Offline"}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: robot.online ? "#24a148" : bgOffline,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: robot.online ? "white" : bgOfflineDot,
                  fontSize: "0.75rem",
                  marginBottom: "0.5rem",
                }}
              >
                Robot
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "0.25rem" }}>
              {robot.alias}
            </div>
            <div style={{ fontSize: "0.8125rem", color: textSecondary, marginBottom: "0.25rem" }}>
              {formatAddressDisplay(robot.address, robot.port)} | {formatInfoValue(robot.model)}
            </div>
            <div style={{ fontSize: "0.8125rem", color: textSecondary, marginBottom: "0.25rem" }}>
              SN: {formatInfoValue(robot.robotSN)}
            </div>
            <div style={{ fontSize: "0.8125rem", color: textSecondary }}>
              Movebase: {formatInfoValue(robot.movebaseVersion)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // List view rendering
  const renderListView = () => {
    const headers = [
      { key: "select", header: "" },
      { key: "alias", header: "Alias" },
      { key: "address", header: "Address" },
      { key: "model", header: "Model" },
      { key: "robotSN", header: "Robot SN" },
      { key: "thingsId", header: "Things ID" },
      { key: "movebaseVersion", header: "Movebase" },
      { key: "actions", header: "Actions" },
    ];

    const rows = filtered.map((r) => ({
      id: r.id,
      select: (
        <input
          type="checkbox"
          checked={selectedIds.has(r.id)}
          onChange={() => toggleSelection(r.id)}
          aria-label={`Select ${r.alias}`}
        />
      ),
      alias:
        editingAliasId === r.id ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: r.online ? "#24a148" : bgOfflineDot,
                flexShrink: 0,
                animation: r.online ? "breathe 2s ease-in-out infinite" : undefined,
              }}
              title={r.online ? "Online" : "Offline"}
            />
            <TextInput
              id={`alias-edit-${r.id}`}
              labelText=""
              hideLabel
              value={editingAliasValue}
              onChange={(e) => setEditingAliasValue(e.target.value)}
              onBlur={() => handleAliasEditSave(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAliasEditSave(r.id);
              }}
              size="sm"
            />
          </div>
        ) : (
          <span
            onDoubleClick={() => handleAliasEditStart(r)}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}
            title="Double-click to edit"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: r.online ? "#24a148" : bgOfflineDot,
                flexShrink: 0,
                animation: r.online ? "breathe 2s ease-in-out infinite" : undefined,
              }}
              title={r.online ? "Online" : "Offline"}
            />
            {r.alias}
          </span>
        ),
      address: formatAddressDisplay(r.address, r.port),
      model: formatInfoValue(r.model),
      robotSN: formatInfoValue(r.robotSN),
      thingsId: formatInfoValue(r.thingsId),
      movebaseVersion: formatInfoValue(r.movebaseVersion),
      actions: (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button kind="ghost" size="sm" onClick={() => openDetail(r)}>
            Details
          </Button>
          <Button
            kind="danger--ghost"
            size="sm"
            onClick={() => {
              setDeleteTarget(r);
              setDeleteConfirmOpen(true);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    }));

    return (
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
                  <TableRow
                    key={key}
                    {...rowProps}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.tagName === "INPUT" ||
                      target.tagName === "BUTTON" ||
                      target.closest("button")
                    ) {
                      return;
                    }
                    const robot = robots.find((r) => r.id === row.id);
                    if (robot) openDetail(robot);
                  }}
                >
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
    );
  };

  if (loading && robots.length === 0) {
    return (
      <div style={{ padding: "2rem" }}>
        <InlineLoading description="Loading robots..." />
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
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
          <span style={{ color: textSecondary }}>
            {activeMeta?.name ?? solutionId}
          </span>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>
          <span>Robots</span>
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
        <h3>Robots</h3>
      </div>

      {robots.length === 0 ? (
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
          <p style={{ fontSize: "1.25rem", color: textSecondary }}>No robots yet</p>
          <p style={{ color: textTertiary }}>
            Add robots to this solution to manage them.
          </p>
          <Button onClick={() => setAddOpen(true)}>Add your first robot</Button>
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
                id="robot-search"
                labelText=""
                hideLabel
                placeholder="Search by alias, address, model or SN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: "280px" }}
              />
              <Button onClick={() => setAddOpen(true)}>Add Robot</Button>
              {selectedIds.size > 0 && (
                <Button kind="danger" onClick={() => setBatchDeleteOpen(true)}>
                  Batch Delete ({selectedIds.size})
                </Button>
              )}
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.25rem" }}>
              <Button
                kind={viewMode === "grid" ? "primary" : "tertiary"}
                size="sm"
                renderIcon={Grid}
                iconDescription="Grid view"
                hasIconOnly
                onClick={() => handleToggleView("grid")}
              />
              <Button
                kind={viewMode === "list" ? "primary" : "tertiary"}
                size="sm"
                renderIcon={List}
                iconDescription="List view"
                hasIconOnly
                onClick={() => handleToggleView("list")}
              />
            </div>
          </div>

          {viewMode === "grid" ? renderGridView() : renderListView()}
        </>
      )}

      <AddRobotModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={async (input) => {
          const robot = await addRobot(input);
          showToast("success", "Robot added", `${robot.alias} has been added.`);
        }}
      />

      <RobotDetailModal
        open={detailOpen}
        robot={detailRobot}
        onClose={() => {
          setDetailOpen(false);
          setDetailRobotId(null);
        }}
        onSave={async (patch) => {
          if (!detailRobot) return;
          await editRobot(detailRobot.id, patch);
          showToast("success", "Robot updated", "Changes saved successfully.");
        }}
      />

      <Modal
        open={deleteConfirmOpen}
        modalHeading="Delete Robot"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onRequestSubmit={handleDelete}
        danger
      >
        <div className="modal-content-enter">
          <p>
            This action cannot be undone. The robot definition will be permanently
            removed from this solution.
          </p>
          {deleteTarget && (
            <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>
              {deleteTarget.alias} ({formatAddressDisplay(deleteTarget.address, deleteTarget.port)})
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={batchDeleteOpen}
        modalHeading={`Delete ${selectedIds.size} Robots`}
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => setBatchDeleteOpen(false)}
        onRequestSubmit={handleBatchDelete}
        danger
      >
        <div className="modal-content-enter">
          <p>
            This action cannot be undone. The selected robot definitions will be
            permanently removed from this solution.
          </p>
        </div>
      </Modal>
    </div>
  );
}
