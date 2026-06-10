import React, { useState } from "react";
import {
  Button,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  TextArea,
  Tag,
} from "@carbon/react";
import { SolutionMeta } from "../../types/solution.js";
import { solutionApi } from "../../api/solutionApi.js";

interface SolutionDetailModalProps {
  solution: SolutionMeta | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function SolutionDetailModal({
  solution,
  onClose,
  onUpdated,
}: SolutionDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(solution?.name ?? "");
  const [description, setDescription] = useState(solution?.description ?? "");
  const [tagsInput, setTagsInput] = useState(solution?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  if (!solution) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await solutionApi.update(solution.id, {
        name: name.trim(),
        description,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setEditing(false);
      onUpdated();
    } catch (err) {
      console.error("Failed to update solution:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ComposedModal open={!!solution} onClose={onClose} size="lg">
      <ModalHeader title={editing ? "Edit Solution" : "Solution Details"} />
      <ModalBody>
        <div className="modal-content-enter">
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <TextInput
              id="edit-name"
              labelText="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextArea
              id="edit-description"
              labelText="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <TextInput
              id="edit-tags"
              labelText="Tags (comma-separated)"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div><strong>ID:</strong> {solution.id}</div>
            <div><strong>Name:</strong> {solution.name}</div>
            <div><strong>Description:</strong> {solution.description || "—"}</div>
            <div><strong>Version:</strong> {solution.version}</div>
            <div><strong>Created:</strong> {new Date(solution.createdAt).toLocaleString()}</div>
            <div><strong>Updated:</strong> {new Date(solution.updatedAt).toLocaleString()}</div>
            <div>
              <strong>Tags:</strong>{" "}
              {solution.tags.map((t) => (
                <Tag key={t} type="blue" size="sm">{t}</Tag>
              ))}
            </div>
            {Object.keys(solution.metadata).length > 0 && (
              <div>
                <strong>Metadata:</strong>
                <pre style={{ fontSize: "0.75rem", background: "#f4f4f4", padding: "0.5rem", borderRadius: "4px" }}>
                  {JSON.stringify(solution.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          Close
        </Button>
        {editing ? (
          <Button kind="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        ) : (
          <Button kind="primary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </ModalFooter>
    </ComposedModal>
  );
}
