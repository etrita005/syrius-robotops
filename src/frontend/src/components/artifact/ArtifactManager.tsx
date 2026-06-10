import React, { useState, Fragment, useMemo, useEffect } from "react";
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
  Loading,
  TextInput,
} from "@carbon/react";
import { TrashCan, View, Download } from "@carbon/react/icons";
import { ArtifactMeta } from "../../types/artifact.js";
import { artifactApi } from "../../api/artifactApi.js";
import { useToast } from "../../hooks/useToast.js";
import { useThemeColor } from "../../hooks/useThemeColors.js";

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
  const [showDelete, setShowDelete] = useState<ArtifactMeta | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [showUnreferencedOnly, setShowUnreferencedOnly] = useState(false);
  const { showToast } = useToast();

  const textTertiary = useThemeColor("#8d8d8d", "#a0a0a0");
  const codeBg = useThemeColor("#f4f4f4", "#262626");

  useEffect(() => {
    if (error) {
      showToast("error", "Error", error, 0);
    }
  }, [error, showToast]);

  const handleDelete = async (id: string) => {
    try {
      await artifactApi.remove(id);
      setShowDelete(null);
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

  const contentTypes = useMemo(() => {
    const types = new Set(artifacts.map((a) => a.contentType));
    return Array.from(types);
  }, [artifacts]);

  const cycleTypeFilter = () => {
    const options = ["All", ...contentTypes];
    const idx = options.indexOf(typeFilter);
    setTypeFilter(options[(idx + 1) % options.length]);
  };

  const filteredArtifacts = useMemo(() => {
    let result = artifacts.filter((a) => {
      if (searchText && !a.fileName.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      if (typeFilter !== "All" && a.contentType !== typeFilter) {
        return false;
      }
      if (showUnreferencedOnly && a.refCount !== 0) {
        return false;
      }
      return true;
    });
    result = [...result].sort((a, b) => {
      const cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return result;
  }, [artifacts, searchText, typeFilter, showUnreferencedOnly, sortOrder]);

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

  const rows = filteredArtifacts.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    size: formatSize(a.size),
    contentType: a.contentType,
    refCount: a.refCount,
    createdAt: new Date(a.createdAt).toLocaleString(),
  }));

  const artifactMap = new Map(artifacts.map((a) => [a.id, a]));

  if (loading) {
    return (
      <div style={{ padding: "2rem 0", textAlign: "center" }}>
        <Loading withOverlay={false} />
      </div>
    );
  }

  return (
    <Fragment>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <TextInput
          id="search-artifacts"
          labelText=""
          placeholder="Search artifacts..."
          value={searchText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
          style={{ width: "260px" }}
        />
        <span
          onClick={cycleTypeFilter}
          style={{
            color: "#0f62fe",
            fontSize: "0.875rem",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          Type: {typeFilter}
        </span>
        <span style={{ color: textTertiary, fontSize: "0.875rem" }}>|</span>
        <span
          onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
          style={{
            color: "#0f62fe",
            fontSize: "0.875rem",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          Sort: {sortOrder === "desc" ? "Recent" : "Oldest"}
        </span>
        <span style={{ color: textTertiary, fontSize: "0.875rem" }}>|</span>
        <span
          onClick={() => setShowUnreferencedOnly((v) => !v)}
          style={{
            color: "#0f62fe",
            fontSize: "0.875rem",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          Show: {showUnreferencedOnly ? "All" : "Unreferenced only"}
        </span>
      </div>

      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getTableProps, getHeaderProps, getRowProps, getCellProps }) => (
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header) => {
                    const headerProps = getHeaderProps({ header });
                    const { key: headerKey, ...headerRest } = headerProps;
                    return (
                      <TableHeader key={headerKey} {...headerRest}>
                        {header.header}
                      </TableHeader>
                    );
                  })}
              </TableRow>
            </TableHead>
            <TableBody>
                {rows.map((row) => {
                  const rowProps = getRowProps({ row });
                  const { key: rowKey, ...rowRest } = rowProps;
                  return (
                    <TableRow key={rowKey} {...rowRest}>
                    {row.cells.map((cell) => {
                      if (cell.info.header === "refCount") {
                        const val = cell.value as number;
                        const refCellProps = getCellProps({ cell });
                        const { key: refCellKey, ...refCellRest } = refCellProps;
                        return (
                          <TableCell key={refCellKey} {...refCellRest}>
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
                        const meta = artifactMap.get(row.id);
                        return (
                          <TableCell key={cell.id}>
                            <Button
                              size="sm"
                              kind="ghost"
                              renderIcon={View}
                              iconDescription="View"
                              hasIconOnly
                              onClick={() => meta && setSelectedArtifact(meta)}
                            />
                            <Button
                              size="sm"
                              kind="ghost"
                              renderIcon={Download}
                              iconDescription="Download"
                              hasIconOnly
                              onClick={() => meta && handleDownload(meta.id)}
                            />
                            <Button
                              size="sm"
                              kind="ghost"
                              renderIcon={TrashCan}
                              iconDescription="Delete"
                              hasIconOnly
                              onClick={() => meta && setShowDelete(meta)}
                            />
                          </TableCell>
                        );
                      }
                      const cellProps = getCellProps({ cell });
                      const { key: cellKey, ...cellRest } = cellProps;
                      return (
                        <TableCell key={cellKey} {...cellRest}>
                          {cell.value}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  );
                })}
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
            <div className="modal-content-enter" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
                  <pre style={{ fontSize: "0.75rem", background: codeBg, padding: "0.5rem", borderRadius: "4px" }}>
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

      {showDelete && (
        <ComposedModal
          open
          onClose={() => setShowDelete(null)}
        >
          <ModalHeader title="Delete Artifact" />
          <ModalBody>
            <div className="modal-content-enter">
              <p style={{ marginBottom: "1rem" }}>
                This will permanently delete the artifact file and its metadata.
              </p>
              <p style={{ fontWeight: 600 }}>
                {showDelete.fileName}
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              kind="secondary"
              onClick={() => setShowDelete(null)}
            >
              Cancel
            </Button>
            <Button
              kind="danger"
              onClick={() => handleDelete(showDelete.id)}
            >
              Delete
            </Button>
          </ModalFooter>
        </ComposedModal>
      )}
    </Fragment>
  );
}
