import React, { useState } from "react";
import {
  Button,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  InlineNotification,
  Loading,
} from "@carbon/react";
import { TrashCan, View, Download } from "@carbon/react/icons";
import { ArtifactMeta } from "../../types/artifact.js";
import { artifactApi } from "../../api/artifactApi.js";

interface ArtifactManagerProps {
  artifacts: ArtifactMeta[];
  total: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function ArtifactManager({
  artifacts,
  total,
  loading,
  error,
  onRefresh,
}: ArtifactManagerProps) {
  const [selectedArtifact, setSelectedArtifact] =
    useState<ArtifactMeta | null>(null);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState("");

  const handleDelete = async (id: string) => {
    try {
      await artifactApi.remove(id);
      setShowDelete(null);
      setDeleteConfirmId("");
      onRefresh();
    } catch (err) {
      console.error("Failed to delete artifact:", err);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      await artifactApi.download(id);
    } catch (err) {
      console.error("Failed to download artifact:", err);
    }
  };

  const headers = [
    { key: "fileName", header: "File Name" },
    { key: "size", header: "Size" },
    { key: "contentType", header: "Type" },
    { key: "refCount", header: "References" },
    { key: "createdAt", header: "Uploaded" },
    { key: "actions", header: "" },
  ];

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const rows = artifacts.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    size: formatSize(a.size),
    contentType: a.contentType,
    refCount: a.refCount,
    createdAt: new Date(a.createdAt).toLocaleString(),
    raw: a,
  }));

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <Loading withOverlay={false} />
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "2rem" }}>
        Artifact Management
      </h1>

      {error && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={error}
          lowContrast
        />
      )}

      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getTableProps, getHeadProps, getRowProps, getCellProps }) => (
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader key={header.key} {...getHeadProps({ header })}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} {...getRowProps({ row })}>
                  {row.cells.map((cell) => {
                    if (cell.info.header === "refCount") {
                      const val = cell.value as number;
                      return (
                        <TableCell key={cell.id} {...getCellProps({ cell })}>
                          {val}
                          {val === 0 && (
                            <Tag type="gray" size="sm" style={{ marginLeft: "0.5rem" }}>
                              Unreferenced
                            </Tag>
                          )}
                        </TableCell>
                      );
                    }
                    if (cell.info.header === "actions") {
                      const meta = row.raw as ArtifactMeta;
                      return (
                        <TableCell key={cell.id} {...getCellProps({ cell })}>
                          <Button
                            size="sm"
                            kind="ghost"
                            renderIcon={View}
                            iconDescription="View"
                            hasIconOnly
                            onClick={() => setSelectedArtifact(meta)}
                          />
                          <Button
                            size="sm"
                            kind="ghost"
                            renderIcon={Download}
                            iconDescription="Download"
                            hasIconOnly
                            onClick={() => handleDownload(meta.id)}
                          />
                          <Button
                            size="sm"
                            kind="ghost"
                            renderIcon={TrashCan}
                            iconDescription="Delete"
                            hasIconOnly
                            onClick={() => setShowDelete(meta.id)}
                          />
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell key={cell.id} {...getCellProps({ cell })}>
                        {cell.value}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataTable>

      {selectedArtifact && (
        <ComposedModal
          open
          onClose={() => setSelectedArtifact(null)}
        >
          <ModalHeader title="Artifact Details" />
          <ModalBody>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div><strong>ID:</strong> {selectedArtifact.id}</div>
              <div><strong>File Name:</strong> {selectedArtifact.fileName}</div>
              <div><strong>Size:</strong> {formatSize(selectedArtifact.size)}</div>
              <div><strong>Checksum:</strong> <code style={{ fontSize: "0.75rem" }}>{selectedArtifact.checksum}</code></div>
              <div><strong>Content Type:</strong> {selectedArtifact.contentType}</div>
              <div><strong>Ref Count:</strong> {selectedArtifact.refCount}</div>
              <div><strong>Created:</strong> {new Date(selectedArtifact.createdAt).toLocaleString()}</div>
              <div>
                <strong>Tags:</strong>{" "}
                {selectedArtifact.tags.map((t) => (
                  <Tag key={t} type="blue" size="sm">{t}</Tag>
                ))}
              </div>
              {Object.keys(selectedArtifact.metadata).length > 0 && (
                <div>
                  <strong>Metadata:</strong>
                  <pre style={{ fontSize: "0.75rem", background: "#f4f4f4", padding: "0.5rem", borderRadius: "4px" }}>
                    {JSON.stringify(selectedArtifact.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button kind="secondary" onClick={() => setSelectedArtifact(null)}>
              Close
            </Button>
          </ModalFooter>
        </ComposedModal>
      )}

      <ComposedModal
        open={showDelete !== null}
        onClose={() => {
          setShowDelete(null);
          setDeleteConfirmId("");
        }}
      >
        <ModalHeader title="Delete Artifact" />
        <ModalBody>
          <p style={{ marginBottom: "1rem" }}>
            This will permanently delete the artifact file and its metadata.
          </p>
          <p style={{ marginBottom: "1rem", fontWeight: 600 }}>
            Please type the artifact ID to confirm:
          </p>
          <TextInput
            id="delete-confirm-id"
            labelText=""
            placeholder="Type artifact ID to confirm"
            value={deleteConfirmId}
            onChange={(e) => setDeleteConfirmId(e.target.value)}
          />
        </ModalBody>
        <ModalFooter>
          <Button
            kind="secondary"
            onClick={() => {
              setShowDelete(null);
              setDeleteConfirmId("");
            }}
          >
            Cancel
          </Button>
          <Button
            kind="danger"
            onClick={() => showDelete && handleDelete(showDelete)}
            disabled={deleteConfirmId !== showDelete}
          >
            Delete artifact
          </Button>
        </ModalFooter>
      </ComposedModal>
    </div>
  );
}
