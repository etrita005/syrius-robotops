import { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Button,
  TextInput,
  InlineLoading,
  Select,
  SelectItem,
} from "@carbon/react";
import type { TaskTypeDefinition } from "../../data/taskRegistry.js";
import type { StoredRobotData } from "../../types/robot.js";
import { formatAddressDisplay } from "../../types/robot.js";
import type { ArtifactMeta } from "../../types/artifact.js";
import { artifactApi } from "../../api/artifactApi.js";
import { listRobots } from "../../api/robotApi.js";

interface CreateTaskModalProps {
  open: boolean;
  solutionId: string;
  taskTypes: TaskTypeDefinition[];
  onClose: () => void;
  onCreate: (
    robotIds: string[],
    taskType: TaskTypeDefinition,
    params: Record<string, string>
  ) => Promise<void>;
}

const STEPS = ["Type", "Robots", "Params", "Confirm"];

export default function CreateTaskModal({
  open,
  solutionId,
  taskTypes,
  onClose,
  onCreate,
}: CreateTaskModalProps) {
  const [step, setStep] = useState(1);
  const [robots, setRobots] = useState<StoredRobotData[]>([]);
  const [robotsLoading, setRobotsLoading] = useState(false);
  const [robotSearch, setRobotSearch] = useState("");
  const [selectedRobotIds, setSelectedRobotIds] = useState<Set<string>>(new Set());
  const [selectedTaskType, setSelectedTaskType] = useState<TaskTypeDefinition | null>(null);
  const [taskTypeSearch, setTaskTypeSearch] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [artifacts, setArtifacts] = useState<ArtifactMeta[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactSearch, setArtifactSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedRobotIds(new Set());
      setSelectedTaskType(null);
      setParams({});
      setError(null);
      setSubmitting(false);
      setRobotSearch("");
      setTaskTypeSearch("");
      setArtifactSearch("");

      setRobotsLoading(true);
      listRobots(solutionId)
        .then((data) => setRobots(data))
        .catch(() => setRobots([]))
        .finally(() => setRobotsLoading(false));

      setArtifactsLoading(true);
      artifactApi
        .list()
        .then((result) => setArtifacts(result.items))
        .catch(() => setArtifacts([]))
        .finally(() => setArtifactsLoading(false));
    }
  }, [open, solutionId]);

  const filteredRobots = useMemo(() => {
    const term = robotSearch.toLowerCase();
    if (!term) return robots;
    return robots.filter(
      (r) =>
        r.alias.toLowerCase().includes(term) ||
        formatAddressDisplay(r.address, r.port).toLowerCase().includes(term)
    );
  }, [robots, robotSearch]);

  const filteredTaskTypes = useMemo(() => {
    const term = taskTypeSearch.toLowerCase();
    if (!term) return taskTypes;
    return taskTypes.filter(
      (t) =>
        t.name.toLowerCase().includes(term) || t.type.toLowerCase().includes(term)
    );
  }, [taskTypes, taskTypeSearch]);

  const filteredArtifacts = useMemo(() => {
    const term = artifactSearch.toLowerCase();
    if (!term) return artifacts;
    return artifacts.filter(
      (a) =>
        a.fileName.toLowerCase().includes(term) ||
        a.id.toLowerCase().includes(term) ||
        a.contentType.toLowerCase().includes(term)
    );
  }, [artifacts, artifactSearch]);

  const robotSelectionMode = selectedTaskType?.robotSelection.mode ?? "multiple";

  const allRobotsSelected =
    filteredRobots.length > 0 && filteredRobots.every((r) => selectedRobotIds.has(r.id));

  const toggleRobot = (robotId: string) => {
    if (robotSelectionMode === "single") {
      setSelectedRobotIds(new Set([robotId]));
      return;
    }
    const next = new Set(selectedRobotIds);
    if (next.has(robotId)) next.delete(robotId);
    else next.add(robotId);
    setSelectedRobotIds(next);
  };

  const toggleAllRobots = (checked: boolean) => {
    if (robotSelectionMode === "single") return;
    if (checked) {
      const allIds = new Set(selectedRobotIds);
      for (const r of filteredRobots) allIds.add(r.id);
      setSelectedRobotIds(allIds);
    } else {
      const removeIds = new Set(filteredRobots.map((r) => r.id));
      const next = new Set(selectedRobotIds);
      for (const id of removeIds) next.delete(id);
      setSelectedRobotIds(next);
    }
  };

  const handleSelectTaskType = (tt: TaskTypeDefinition) => {
    setSelectedTaskType(tt);
    setSelectedRobotIds(new Set());
    setParams({});
  };

  const canNext = (): boolean => {
    switch (step) {
      case 1:
        return selectedTaskType !== null;
      case 2:
        return selectedRobotIds.size > 0;
      case 3:
        if (!selectedTaskType) return false;
        return Object.entries(selectedTaskType.params)
          .filter(([, desc]) => desc.required)
          .every(([key]) => !!params[key]);
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    setError(null);
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!selectedTaskType) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(
        Array.from(selectedRobotIds),
        selectedTaskType,
        params
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const selectedTypeParams = selectedTaskType?.params ?? {};

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return renderSelectTaskType();
      case 2:
        return renderSelectRobots();
      case 3:
        return renderConfigureParams();
      case 4:
        return renderConfirm();
      default:
        return null;
    }
  };

  const renderSelectTaskType = () => (
    <div>
      <p style={{ marginBottom: "1rem", color: "#525252", fontSize: "0.875rem" }}>
        Choose the type of task to execute. The task type determines robot selection mode and required parameters.
      </p>
      <TextInput
        id="task-type-search"
        labelText=""
        hideLabel
        placeholder="Search task types..."
        value={taskTypeSearch}
        onChange={(e) => setTaskTypeSearch(e.target.value)}
        style={{ marginBottom: "0.75rem" }}
      />
      <div style={{ maxHeight: "300px", overflow: "auto" }}>
        {filteredTaskTypes.map((tt) => {
          const isSelected = selectedTaskType?.type === tt.type;
          return (
            <div
              key={tt.type}
              onClick={() => handleSelectTaskType(tt)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.75rem 1rem",
                marginBottom: "0.5rem",
                border: isSelected ? "2px solid #0f62fe" : "1px solid #c6c6c6",
                borderRadius: "4px",
                cursor: "pointer",
                background: isSelected ? "#f0f7ff" : "white",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: isSelected ? "none" : "1px solid #8d8d8d",
                  background: isSelected ? "#0f62fe" : "white",
                  marginRight: "0.75rem",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isSelected && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{tt.name}</div>
                <div style={{ color: "#525252", fontSize: "0.8125rem", marginTop: "0.125rem" }}>
                  {tt.description}
                </div>
                <div style={{ color: "#8d8d8d", fontSize: "0.75rem", marginTop: "0.125rem" }}>
                  Robot selection: {tt.robotSelection.mode === "single" ? "Single robot" : "Multiple robots"}
                </div>
              </div>
            </div>
          );
        })}
        {filteredTaskTypes.length === 0 && (
          <p style={{ color: "#525252", padding: "2rem", textAlign: "center" }}>
            No task types match your search.
          </p>
        )}
      </div>
    </div>
  );

  const renderSelectRobots = () => {
    const mode = robotSelectionMode;
    const singleHint = mode === "single"
      ? "Select exactly one target robot for this task type."
      : "Select one or more target robots from the current solution. You must select at least one robot to proceed.";

    return (
      <div>
        <p style={{ marginBottom: "1rem", color: "#525252", fontSize: "0.875rem" }}>
          {selectedTaskType?.robotSelection.description ?? singleHint}
        </p>
        <TextInput
          id="robot-search-modal"
          labelText=""
          hideLabel
          placeholder="Search robots..."
          value={robotSearch}
          onChange={(e) => setRobotSearch(e.target.value)}
          style={{ marginBottom: "0.75rem" }}
        />
        {robotsLoading ? (
          <InlineLoading description="Loading robots..." />
        ) : filteredRobots.length === 0 ? (
          <p style={{ color: "#525252", padding: "2rem", textAlign: "center" }}>
            No robots found. Add robots to this solution first.
          </p>
        ) : (
          <>
            {mode === "multiple" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #e0e0e0",
                  background: "#e0e0e0",
                }}
              >
                <div style={{ width: 36, display: "flex", justifyContent: "center" }}>
                  <input
                    type="checkbox"
                    checked={allRobotsSelected}
                    onChange={(e) => toggleAllRobots(e.target.checked)}
                    aria-label="Select all robots"
                  />
                </div>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#525252" }}>
                  Select All
                </span>
              </div>
            )}
            <div style={{ maxHeight: "240px", overflow: "auto" }}>
              {filteredRobots.map((robot, i) => (
                <div
                  key={robot.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.6rem 0",
                    borderBottom: "1px solid #f0f0f0",
                    background: i % 2 === 0 ? "white" : "#fafafa",
                  }}
                >
                  <div style={{ width: 36, display: "flex", justifyContent: "center" }}>
                    {mode === "multiple" ? (
                      <input
                        type="checkbox"
                        checked={selectedRobotIds.has(robot.id)}
                        onChange={() => toggleRobot(robot.id)}
                        aria-label={`Select ${robot.alias}`}
                      />
                    ) : (
                      <input
                        type="radio"
                        name="robot-selection"
                        checked={selectedRobotIds.has(robot.id)}
                        onChange={() => toggleRobot(robot.id)}
                        aria-label={`Select ${robot.alias}`}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{robot.alias}</span>
                    <span style={{ marginLeft: "1rem", color: "#525252", fontSize: "0.8125rem" }}>
                      {formatAddressDisplay(robot.address, robot.port)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: "0.75rem", color: "#525252", fontSize: "0.875rem" }}>
              {selectedRobotIds.size} robot{selectedRobotIds.size !== 1 ? "s" : ""} selected
            </p>
          </>
        )}
      </div>
    );
  };

  const renderConfigureParams = () => (
    <div>
      <p style={{ marginBottom: "0.5rem", color: "#525252", fontSize: "0.875rem" }}>
        Parameters are rendered dynamically based on the selected task type.
      </p>
      <p style={{ marginBottom: "1rem", fontWeight: 500, fontSize: "0.875rem" }}>
        Task: {selectedTaskType?.name}
      </p>
      {Object.entries(selectedTypeParams).map(([paramKey, paramDesc]) => (
        <div key={paramKey} style={{ marginBottom: "1.5rem" }}>
          <p style={{ marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}>
            {paramDesc.label}
            {paramDesc.required && <span style={{ color: "#fa4d56", marginLeft: "0.25rem" }}>*</span>}
          </p>
          {paramDesc.type === "artifact" && (
            <div>
              <TextInput
                id={`artifact-search-${paramKey}`}
                labelText=""
                hideLabel
                placeholder="Search artifacts..."
                value={artifactSearch}
                onChange={(e) => setArtifactSearch(e.target.value)}
                style={{ marginBottom: "0.5rem" }}
              />
              {artifactsLoading ? (
                <InlineLoading description="Loading artifacts..." />
              ) : (
                <div style={{ maxHeight: "180px", overflow: "auto", border: "1px solid #e0e0e0" }}>
                  {filteredArtifacts.map((a, i) => {
                    const isSelected = params[paramKey] === a.id;
                    return (
                      <div
                        key={a.id}
                        onClick={() => setParams({ ...params, [paramKey]: a.id })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "0.6rem 0.75rem",
                          cursor: "pointer",
                          background: isSelected ? "#f0f7ff" : i % 2 === 0 ? "white" : "#fafafa",
                          borderBottom: "1px solid #f0f0f0",
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            border: isSelected ? "5px solid #0f62fe" : "1px solid #8d8d8d",
                            marginRight: "0.75rem",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{a.fileName}</span>
                        </div>
                        <span style={{ color: "#525252", fontSize: "0.75rem", marginRight: "1rem" }}>
                          {a.contentType}
                        </span>
                        <span style={{ color: "#525252", fontSize: "0.75rem", marginRight: "1rem" }}>
                          {formatFileSize(a.size)}
                        </span>
                        <span style={{ color: "#525252", fontSize: "0.75rem" }}>
                          {new Date(a.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    );
                  })}
                  {filteredArtifacts.length === 0 && !artifactsLoading && (
                    <p style={{ padding: "1.5rem", textAlign: "center", color: "#525252", fontSize: "0.875rem" }}>
                      No artifacts found. Upload artifacts in the Artifact Manager first.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {paramDesc.type === "text" && (
            <TextInput
              id={`param-${paramKey}`}
              labelText=""
              hideLabel
              placeholder={`Enter ${paramDesc.label.toLowerCase()}...`}
              value={params[paramKey] ?? ""}
              onChange={(e) => setParams({ ...params, [paramKey]: e.target.value })}
            />
          )}
          {paramDesc.type === "number" && (
            <TextInput
              id={`param-${paramKey}`}
              labelText=""
              hideLabel
              type="number"
              placeholder={`Enter ${paramDesc.label.toLowerCase()}...`}
              value={params[paramKey] ?? ""}
              onChange={(e) => setParams({ ...params, [paramKey]: e.target.value })}
            />
          )}
          {paramDesc.type === "select" && (
            <Select
              id={`param-${paramKey}`}
              labelText=""
              hideLabel
              noLabel
              value={params[paramKey] ?? ""}
              onChange={(e) => setParams({ ...params, [paramKey]: e.target.value })}
            >
              <SelectItem value="" text={`Select ${paramDesc.label.toLowerCase()}...`} />
              {(paramDesc.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt} text={opt} />
              ))}
            </Select>
          )}
        </div>
      ))}
    </div>
  );

  const renderConfirm = () => {
    const robotList = robots
      .filter((r) => selectedRobotIds.has(r.id))
      .map((r) => r.alias)
      .join(", ");

    const paramSummary = Object.entries(selectedTypeParams).map(([paramKey, paramDesc]) => {
      let value = params[paramKey] ?? "(not set)";
      if (paramDesc.type === "artifact" && params[paramKey]) {
        const art = artifacts.find((a) => a.id === params[paramKey]);
        if (art) value = `${art.fileName} (${formatFileSize(art.size)})`;
      }
      return { label: paramDesc.label, value };
    });

    return (
      <div>
        <p style={{ marginBottom: "1rem", color: "#525252", fontSize: "0.875rem" }}>
          Review the task details before creating.
        </p>
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ marginBottom: "0.75rem" }}>
            <span style={{ color: "#525252", fontSize: "0.875rem" }}>Task Type: </span>
            <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{selectedTaskType?.name}</span>
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <span style={{ color: "#525252", fontSize: "0.875rem" }}>Target Robots: </span>
            <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{robotList}</span>
          </div>
          {paramSummary.map(({ label, value }) => (
            <div key={label} style={{ marginBottom: "0.75rem" }}>
              <span style={{ color: "#525252", fontSize: "0.875rem" }}>{label}: </span>
              <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      modalHeading="Create Task"
      size="md"
      onRequestClose={handleClose}
      passiveModal={submitting}
      primaryButtonText={
        submitting ? "Creating..." : step < 4 ? "Next" : "Create"
      }
      secondaryButtonText={step > 1 ? "Back" : "Cancel"}
      onRequestSubmit={
        step < 4
          ? () => handleNext()
          : () => handleSubmit()
      }
      primaryButtonDisabled={!canNext() || submitting}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.25rem" }}>
          {STEPS.map((s, i) => {
            const stepNum = i + 1;
            const isActive = stepNum <= step;
            const isCurrent = stepNum === step;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: isActive ? "#0f62fe" : "#c6c6c6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: isCurrent ? "2px solid #161616" : "none",
                    }}
                  >
                    {stepNum}
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: isCurrent ? 600 : 400,
                      color: isActive ? "#161616" : "#8d8d8d",
                    }}
                  >
                    {s}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      width: 40,
                      height: 1,
                      background: "#c6c6c6",
                      margin: "0 0.5rem",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p style={{ color: "#fa4d56", fontSize: "0.875rem", marginBottom: "1rem" }}>{error}</p>
      )}

      {renderStepContent()}

      {step === 4 && (
        <p style={{ marginTop: "1rem", color: "#525252", fontSize: "0.875rem" }}>
          Are you sure you want to create this task?
        </p>
      )}
    </Modal>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
