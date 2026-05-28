import React, { useState, useCallback } from "react";
import {
  FileUploaderDropContainer,
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
  const [results, setResults] = useState<
    { name: string; result: UploadResult }[]
  >([]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      setUploading(true);
      setResults([]);

      for (const file of files) {
        try {
          const result = await artifactApi.upload(file.name, {
            tags: [],
            metadata: { originalPath: file.name },
          });
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

  const successCount = results.filter((r) => r.result.status === "success").length;
  const dedupCount = results.filter((r) => r.result.status === "deduplicated").length;
  const failCount = results.filter((r) => r.result.status === "failed").length;

  return (
    <div style={{ marginBottom: "2rem" }}>
      <FileUploaderDropContainer
        labelText="Drag and drop files here or click to upload"
        onAddFiles={(event: { addedFiles: File[] }) => {
          handleUpload(event.addedFiles);
        }}
        multiple
        disabled={uploading}
      />

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
                  : "error"
              }
              errorSubject={r.result.error ?? "Upload failed"}
              errorBody=""
            />
          ))}
        </div>
      )}
    </div>
  );
}
