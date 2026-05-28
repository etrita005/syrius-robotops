import React, { useState } from "react";
import {
  Button,
  Grid,
  Column,
  Tag,
  TextInput,
  TextArea,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Loading,
  InlineNotification,
} from "@carbon/react";
import { Add, Export, Copy, TrashCan } from "@carbon/react/icons";
import { SolutionMeta, CreateSolutionInput } from "../../types/solution.js";
import { solutionApi } from "../../api/solutionApi.js";

interface SolutionSelectorProps {
  solutions: SolutionMeta[];
  corruptedIds: string[];
  loading: boolean;
  onRefresh: () => void;
  onActivate: (id: string) => void;
}

export function SolutionSelector({
  solutions,
  corruptedIds,
  loading,
  onRefresh,
  onActivate,
}: SolutionSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createInput, setCreateInput] = useState<CreateSolutionInput>({
    name: "",
    description: "",
    tags: [],
  });

  const filtered = solutions.filter((s) =>
    searchName
      ? s.name.toLowerCase().includes(searchName.toLowerCase())
      : true
  );

  const handleCreate = async () => {
    if (!createInput.name.trim()) return;
    setCreating(true);
    try {
      const meta = await solutionApi.create(createInput);
      await onActivate(meta.id);
      setShowCreate(false);
      setCreateInput({ name: "", description: "", tags: [] });
      onRefresh();
    } catch (err) {
      console.error("Failed to create solution:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await solutionApi.remove(id);
      setShowDelete(null);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete solution:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleClone = async (sourceId: string, sourceName: string) => {
    try {
      await solutionApi.clone(sourceId, `${sourceName} (Copy)`);
      onRefresh();
    } catch (err) {
      console.error("Failed to clone solution:", err);
    }
  };

  const handleExport = async (id: string) => {
    try {
      await solutionApi.exportSolution(id);
    } catch (err) {
      console.error("Failed to export solution:", err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <Loading withOverlay={false} />
        <p style={{ marginTop: "1rem" }}>Loading solutions...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "2rem",
            }}
          >
            <h1 style={{ fontSize: "1.75rem", fontWeight: 600 }}>
              Solutions
            </h1>
            <Button
              renderIcon={Add}
              onClick={() => setShowCreate(true)}
            >
              Create solution
            </Button>
          </div>

          <TextInput
            id="solution-search"
            labelText=""
            placeholder="Search solutions..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            style={{ marginBottom: "1.5rem" }}
          />

          {corruptedIds.length > 0 && (
            <InlineNotification
              kind="warning"
              title="Corrupted solutions detected"
              subtitle={`Solutions with corrupted metadata: ${corruptedIds.join(", ")}`}
              lowContrast
            />
          )}

          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "4rem",
                color: "#8d8d8d",
              }}
            >
              <p style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
                No solutions found
              </p>
              <p>Create or import a solution to get started.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              {filtered.map((solution) => (
                <div
                  key={solution.id}
                  style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: "4px",
                    padding: "1.25rem",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                        {solution.name}
                      </h3>
                      {solution.description && (
                        <p
                          style={{
                            color: "#525252",
                            marginTop: "0.25rem",
                            maxWidth: "600px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {solution.description}
                        </p>
                      )}
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          marginTop: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        {solution.tags.map((tag) => (
                          <Tag key={tag} type="blue" size="sm">
                            {tag}
                          </Tag>
                        ))}
                      </div>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "#8d8d8d",
                          marginTop: "0.5rem",
                        }}
                      >
                        Updated:{" "}
                        {new Date(solution.updatedAt).toLocaleString()} | v
                        {solution.version}
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <Button
                        size="sm"
                        kind="primary"
                        onClick={() => onActivate(solution.id)}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        kind="ghost"
                        renderIcon={Export}
                        iconDescription="Export"
                        hasIconOnly
                        onClick={() => handleExport(solution.id)}
                      />
                      <Button
                        size="sm"
                        kind="ghost"
                        renderIcon={Copy}
                        iconDescription="Clone"
                        hasIconOnly
                        onClick={() =>
                          handleClone(solution.id, solution.name)
                        }
                      />
                      <Button
                        size="sm"
                        kind="ghost"
                        renderIcon={TrashCan}
                        iconDescription="Delete"
                        hasIconOnly
                        onClick={() => setShowDelete(solution.id)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Column>
      </Grid>

      <ComposedModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      >
        <ModalHeader title="Create solution" />
        <ModalBody>
          <TextInput
            id="create-name"
            labelText="Name"
            required
            value={createInput.name}
            onChange={(e) =>
              setCreateInput({ ...createInput, name: e.target.value })
            }
            style={{ marginBottom: "1rem" }}
          />
          <TextArea
            id="create-description"
            labelText="Description"
            value={createInput.description ?? ""}
            onChange={(e) =>
              setCreateInput({
                ...createInput,
                description: e.target.value,
              })
            }
            rows={3}
            style={{ marginBottom: "1rem" }}
          />
          <TextInput
            id="create-tags"
            labelText="Tags (comma-separated)"
            value={createInput.tags?.join(", ") ?? ""}
            onChange={(e) =>
              setCreateInput({
                ...createInput,
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setShowCreate(false)}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={handleCreate}
            disabled={!createInput.name.trim() || creating}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </ModalFooter>
      </ComposedModal>

      <ComposedModal
        open={showDelete !== null}
        onClose={() => {
          if (!deleting) setShowDelete(null);
        }}
      >
        <ModalHeader title="Delete solution" />
        <ModalBody>
          <p>
            This action is destructive and cannot be undone. All sub-resources
            will be permanently deleted.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            kind="secondary"
            disabled={deleting}
            onClick={() => setShowDelete(null)}
          >
            Cancel
          </Button>
          <Button
            kind="danger"
            disabled={deleting}
            onClick={() => showDelete && handleDelete(showDelete)}
          >
            {deleting ? "Deleting..." : "Delete solution"}
          </Button>
        </ModalFooter>
      </ComposedModal>
    </div>
  );
}
