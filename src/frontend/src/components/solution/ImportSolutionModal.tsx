import React, { useState, useRef, useCallback } from "react";
import {
  Button,
  Loading,
  InlineLoading,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@carbon/react";
import { solutionApi } from "../../api/solutionApi.js";
import { SolutionMeta, ConflictResolution } from "../../types/solution.js";
import { useToast } from "../../hooks/useToast.js";

interface ImportSolutionModalProps {
  onClose: () => void;
  onImportComplete: (meta: SolutionMeta) => void;
}

type ImportStep = "select" | "validating" | "conflict" | "importing" | "error";

interface ConflictState {
  archiveSolution: { id: string; name: string };
  existingSolution: { id: string; name: string };
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export function ImportSolutionModal({ onClose, onImportComplete }: ImportSolutionModalProps) {
  const [step, setStep] = useState<ImportStep>("select");
  const [file, setFile] = useState<File | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<ConflictResolution>("rename");
  const [errorMessage, setErrorMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const textSecondary = "#525252";

  const resetState = useCallback(() => {
    setStep("select");
    setFile(null);
    setConflict(null);
    setSelectedResolution("rename");
    setErrorMessage("");
  }, []);

  const doImport = useCallback(async (selectedFile: File, resolution: ConflictResolution) => {
    setStep("importing");
    try {
      const result = await solutionApi.importSolutionFile(selectedFile, resolution);
      if (result.ok) {
        if (result.warnings && result.warnings.length > 0) {
          showToast("warning", "Import completed with warnings", result.warnings.join("; "), 0);
        } else {
          showToast("success", "Import complete", `Solution '${result.solution.name}' imported successfully.`);
        }
        onImportComplete(result.solution);
      } else {
        setStep("error");
        setErrorMessage("Import failed.");
      }
    } catch (err) {
      setStep("error");
      setErrorMessage(err instanceof Error ? err.message : "Import failed.");
    }
  }, [onImportComplete, showToast]);

  const handleFileSelected = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".zip")) {
      setStep("error");
      setErrorMessage("Only .zip files are supported.");
      return;
    }

    setFile(selectedFile);
    setStep("validating");

    try {
      const arrayBuffer = await readFileAsArrayBuffer(selectedFile);

      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(arrayBuffer);

      const metaEntry = Object.values(zip.files).find(
        (f) => !f.dir && f.name.match(/(^|\/)meta\.json$/)
      );

      if (!metaEntry) {
        setStep("error");
        setErrorMessage("The selected file is not a valid solution archive.");
        return;
      }

      const metaJson = await metaEntry.async("string");

      let meta: { id: string; name: string };
      try {
        meta = JSON.parse(metaJson);
      } catch {
        setStep("error");
        setErrorMessage("The selected file contains invalid JSON.");
        return;
      }

      if (!meta.id || !meta.name) {
        setStep("error");
        setErrorMessage("The selected file is not a valid solution archive.");
        return;
      }

      try {
        const existingMeta = await solutionApi.get(meta.id);
        setConflict({
          archiveSolution: { id: meta.id, name: meta.name },
          existingSolution: { id: existingMeta.id, name: existingMeta.name },
        });
        setStep("conflict");
      } catch {
        await doImport(selectedFile, "rename");
      }
    } catch (err) {
      console.error("Import validation error:", err);
      setStep("error");
      setErrorMessage("Failed to read the archive file.");
    }
  }, [doImport]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelected(droppedFile);
    }
  }, [handleFileSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelected(selectedFile);
    }
  }, [handleFileSelected]);

  const handleConflictContinue = useCallback(() => {
    if (file) {
      doImport(file, selectedResolution);
    }
  }, [file, selectedResolution, doImport]);

  const renderSelectStep = () => (
    <>
      <p style={{ color: textSecondary, marginBottom: "1rem" }}>
        Select a solution archive (.zip) to import.
      </p>
      <div
        style={{
          border: `2px dashed ${dragOver ? "#0f62fe" : "#8d8d8d"}`,
          borderRadius: "8px",
          padding: "3rem 2rem",
          textAlign: "center",
          backgroundColor: dragOver ? "#f0f8ff" : "#f4f4f4",
          transition: "border-color 0.2s ease, background-color 0.2s ease",
          marginBottom: "1rem",
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          {file ? "📦" : "⬆"}
        </div>
        <Button kind="tertiary" onClick={handleBrowseClick}>
          {file ? "Change file" : "Browse files"}
        </Button>
        <p style={{ color: "#8d8d8d", marginTop: "1rem", fontSize: "0.875rem" }}>
          or drag and drop a .zip file here
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />
      {file && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#f0f8ff",
            border: "1px solid #0f62fe",
            borderRadius: "4px",
          }}
        >
          <p style={{ fontWeight: 600 }}>{file.name}</p>
          <p style={{ color: textSecondary, fontSize: "0.75rem" }}>
            {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
      )}
    </>
  );

  const renderValidatingStep = () => (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <Loading withOverlay={false} />
      <p style={{ marginTop: "1rem", color: textSecondary }}>Validating archive...</p>
    </div>
  );

  const renderConflictStep = () => (
    <>
      <p style={{ color: "#e0822c", marginBottom: "1rem", fontWeight: 500 }}>
        A solution with the same ID already exists.
      </p>
      {conflict && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#fff8e1",
            border: "1px solid #f1c21b",
            borderRadius: "4px",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            Existing solution: {conflict.existingSolution.name}
          </p>
          <p style={{ color: textSecondary, fontSize: "0.875rem" }}>
            ID: {conflict.existingSolution.id}
          </p>
        </div>
      )}
      <p style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Choose resolution:</p>

      <div
        onClick={() => setSelectedResolution("rename")}
        style={{
          padding: "1rem",
          border: `2px solid ${selectedResolution === "rename" ? "#0f62fe" : "#e0e0e0"}`,
          borderRadius: "4px",
          marginBottom: "0.75rem",
          cursor: "pointer",
          backgroundColor: selectedResolution === "rename" ? "#f0f8ff" : "white",
        }}
      >
        <p style={{ fontWeight: 600 }}>Rename imported solution (recommended)</p>
        <p style={{ color: textSecondary, fontSize: "0.875rem" }}>
          Keep both solutions. A new unique ID will be auto-generated.
        </p>
      </div>

      <div
        onClick={() => setSelectedResolution("overwrite")}
        style={{
          padding: "1rem",
          border: `2px solid ${selectedResolution === "overwrite" ? "#0f62fe" : "#e0e0e0"}`,
          borderRadius: "4px",
          marginBottom: "0.75rem",
          cursor: "pointer",
          backgroundColor: selectedResolution === "overwrite" ? "#f0f8ff" : "white",
        }}
      >
        <p style={{ fontWeight: 600 }}>Overwrite existing solution</p>
        <p style={{ color: "#da1e28", fontSize: "0.875rem" }}>
          Delete the existing solution and replace with imported data. All existing data will be lost.
        </p>
      </div>

      <div
        onClick={() => setSelectedResolution("cancel")}
        style={{
          padding: "1rem",
          border: `2px solid ${selectedResolution === "cancel" ? "#0f62fe" : "#e0e0e0"}`,
          borderRadius: "4px",
          cursor: "pointer",
          backgroundColor: selectedResolution === "cancel" ? "#f0f8ff" : "white",
        }}
      >
        <p style={{ fontWeight: 600 }}>Cancel import</p>
        <p style={{ color: textSecondary, fontSize: "0.875rem" }}>
          Discard this import without making any changes.
        </p>
      </div>
    </>
  );

  const renderImportingStep = () => (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <InlineLoading description="Importing resources..." status="active" />
      <p style={{ color: textSecondary, marginTop: "1rem" }}>
        This may take a moment for large archives.
      </p>
    </div>
  );

  const renderErrorStep = () => (
    <>
      <p style={{ color: "#da1e28", marginBottom: "1rem", fontWeight: 500 }}>
        {errorMessage}
      </p>
      <Button kind="secondary" onClick={resetState}>
        Try again
      </Button>
    </>
  );

  return (
    <ComposedModal
      open
      onClose={() => {
        if (step !== "importing") {
          onClose();
        }
      }}
      size="md"
    >
      <ModalHeader title="Import solution" />
      <ModalBody>
        {step === "select" && renderSelectStep()}
        {step === "validating" && renderValidatingStep()}
        {step === "conflict" && renderConflictStep()}
        {step === "importing" && renderImportingStep()}
        {step === "error" && renderErrorStep()}
      </ModalBody>
      <ModalFooter>
        {step === "select" && (
          <>
            <Button kind="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              kind="primary"
              disabled={!file}
              onClick={() => {
                if (file) doImport(file, "rename");
              }}
            >
              Import
            </Button>
          </>
        )}
        {step === "conflict" && (
          <>
            <Button kind="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              kind="primary"
              onClick={() => {
                if (selectedResolution === "cancel") {
                  onClose();
                } else {
                  handleConflictContinue();
                }
              }}
            >
              {selectedResolution === "cancel" ? "Close" : "Continue"}
            </Button>
          </>
        )}
        {step === "error" && (
          <Button kind="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </ModalFooter>
    </ComposedModal>
  );
}
