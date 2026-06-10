import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  FileUploaderItem,
} from "@carbon/react";
import { artifactApi } from "../../api/artifactApi.js";
import { UploadResult } from "../../types/artifact.js";
import { useToast } from "../../hooks/useToast.js";
import { useThemeColor } from "../../hooks/useThemeColors.js";

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
  const { showToast } = useToast();

  const dropBgNormal = useThemeColor("#f4f4f4", "#262626");
  const dropBgDrag = useThemeColor("#e8f0fe", "#1a2a3a");
  const dropText = useThemeColor("#0f62fe", "#78a9ff");
  const dropTextHint = useThemeColor("#8d8d8d", "#a0a0a0");
  const dropBorderDrag = useThemeColor("#002d9c", "#78a9ff");

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
      const successCount = results.filter((r) => r.result.status === "success").length;
      const dedupCount = results.filter((r) => r.result.status === "deduplicated").length;
      const failCount = results.filter((r) => r.result.status === "failed").length;
      showToast(
        failCount > 0 ? "warning" : "success",
        "Upload Summary",
        `${successCount} succeeded, ${dedupCount} deduplicated, ${failCount} failed`,
        5000
      );
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
  }, [uploading, results.length, showToast]);

  const successCount = results.filter((r) => r.result.status === "success").length;

  return (
    <div>
      <div
        className={uploading ? "upload-pulse" : ""}
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${isDragOver ? dropBorderDrag : dropText}`,
          borderRadius: "4px",
          padding: "1.5rem",
          textAlign: "center",
          backgroundColor: isDragOver ? dropBgDrag : dropBgNormal,
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
        <p style={{ color: dropText, fontSize: "1rem", fontWeight: 400, margin: 0 }}>
          Drag and drop files here or click to upload
        </p>
        <p style={{ color: dropTextHint, fontSize: "0.875rem", margin: "0.25rem 0 0 0" }}>
          Supports batch upload
        </p>
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
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
