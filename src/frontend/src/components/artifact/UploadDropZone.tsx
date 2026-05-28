import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  FileUploaderItem,
  InlineNotification,
} from "@carbon/react";
import { artifactApi } from "../../api/artifactApi.js";
import { UploadResult } from "../../types/artifact.js";

interface UploadDropZoneProps {
  onUploadComplete?: () => void;
}

export function UploadDropZone({ onUploadComplete }: UploadDropZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [results, setResults] = useState<
    { name: string; result: UploadResult }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setResults([]);

      for (const file of files) {
        try {
          const result = await artifactApi.uploadFile(file);
          setResults((prev) => [...prev, { name: file.name, result }]);
        } catch (err) {
          setResults((prev) => [
            ...prev,
            {
              name: file.name,
              result: {
                status: "failed",
                error: (err as Error).message,
              },
            },
          ]);
        }
      }

      setUploading(false);
      onUploadComplete?.();
    },
    [onUploadComplete]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    handleFiles(files);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    handleFiles(files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uploading && results.length > 0) {
      dismissTimerRef.current = setTimeout(() => {
        setResults([]);
      }, 5000);
    }
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [uploading, results.length]);

  const successCount = results.filter((r) => r.result.status === "success").length;
  const dedupCount = results.filter((r) => r.result.status === "deduplicated").length;
  const failCount = results.filter((r) => r.result.status === "failed").length;

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${isDragOver ? "#002d9c" : "#0f62fe"}`,
          borderRadius: "4px",
          padding: "1.5rem",
          textAlign: "center",
          backgroundColor: isDragOver ? "#e8f0fe" : "#f4f4f4",
          cursor: uploading ? "not-allowed" : "pointer",
          opacity: uploading ? 0.6 : 1,
          transition: "all 0.11s cubic-bezier(0.2, 0, 0.38, 0.9)",
        }}
      >
        <input
          type="file"
          multiple
          ref={inputRef}
          style={{ display: "none" }}
          onChange={handleChange}
          disabled={uploading}
        />
        <p style={{ color: "#0f62fe", fontSize: "1rem", fontWeight: 400, margin: 0 }}>
          Drag and drop files here or click to upload
        </p>
        <p style={{ color: "#8d8d8d", fontSize: "0.875rem", margin: "0.25rem 0 0 0" }}>
          Supports batch upload
        </p>
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <InlineNotification
            kind={failCount > 0 ? "warning" : "success"}
            title="Upload Summary"
            subtitle={`${successCount} succeeded, ${dedupCount} deduplicated, ${failCount} failed`}
            lowContrast
          />
          {results.map((r, i) => (
            <FileUploaderItem
              key={i}
              name={r.name}
              status={
                r.result.status === "success"
                  ? "complete"
                  : r.result.status === "deduplicated"
                  ? "edit"
                  : "edit"
              }
              invalid={r.result.status === "failed"}
              errorSubject={r.result.error ?? "Upload failed"}
              errorBody=""
            />
          ))}
        </div>
      )}
    </div>
  );
}
