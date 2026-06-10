import React, { useState } from "react";
import {
  Button,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Tag,
} from "@carbon/react";
import { Switcher } from "@carbon/react/icons";
import { useActiveSolution } from "../../hooks/useActiveSolution.js";
import { useRecentSolutions } from "../../hooks/useRecentSolutions.js";
import { RecentSolutionEntry } from "../../types/solution.js";

export function ActiveSolutionHeader() {
  const { activeId, activeMeta, activate, deactivate } = useActiveSolution();
  const { entries, recordAccess, remove } = useRecentSolutions();
  const [showSwitcher, setShowSwitcher] = useState(false);

  if (!activeId) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0 1rem",
        background: "#e0e0e0",
        color: "#161616",
        height: "48px",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
        Active Solution:
      </span>
      <span style={{ fontSize: "0.875rem" }}>
        {activeMeta?.name ?? activeId}
      </span>
      <Button
        size="sm"
        kind="ghost"
        renderIcon={Switcher}
        iconDescription="Switch solution"
        hasIconOnly
        onClick={() => setShowSwitcher(true)}
      />
      <Button
        size="sm"
        kind="ghost"
        onClick={deactivate}
        style={{ marginLeft: "auto" }}
      >
        Close
      </Button>

      <ComposedModal
        open={showSwitcher}
        onClose={() => setShowSwitcher(false)}
      >
        <ModalHeader title="Switch Solution" />
        <ModalBody>
          <div className="modal-content-enter">
          {entries.length === 0 ? (
            <p style={{ color: "#8d8d8d" }}>No recent solutions.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {entries.map((entry: RecentSolutionEntry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem",
                    border: "1px solid #e0e0e0",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                  onClick={async () => {
                    try {
                      await activate(entry.id);
                      setShowSwitcher(false);
                    } catch {
                      remove(entry.id);
                    }
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{entry.name}</span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#8d8d8d",
                        marginLeft: "0.5rem",
                      }}
                    >
                      {new Date(entry.accessedAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.id === activeId && (
                    <Tag type="green" size="sm">
                      Active
                    </Tag>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setShowSwitcher(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </ComposedModal>
    </div>
  );
}
