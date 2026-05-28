import React, { useState } from "react";
import {
  Button,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@carbon/react";
import { RecentSolutionEntry } from "../../types/solution.js";

interface RecentSolutionsDropdownProps {
  entries: RecentSolutionEntry[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export function RecentSolutionsDropdown({
  entries,
  onSelect,
  onRemove,
}: RecentSolutionsDropdownProps) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <>
      <Button size="sm" kind="ghost" onClick={() => setOpen(true)}>
        Recent ({entries.length})
      </Button>
      <ComposedModal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Recent Solutions" />
        <ModalBody>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  border: "1px solid #e0e0e0",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                onClick={() => {
                  onSelect(entry.id);
                  setOpen(false);
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{entry.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "#8d8d8d" }}>
                    {new Date(entry.accessedAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  kind="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(entry.id);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </ComposedModal>
    </>
  );
}
