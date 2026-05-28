import React, { useState, useEffect } from "react";
import {
  Button,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  Loading,
} from "@carbon/react";
import { ArtifactMeta } from "../../types/artifact.js";
import { artifactApi } from "../../api/artifactApi.js";

interface ArtifactSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (artifact: { artifactId: string; fileName: string; size: number; checksum: string }) => void;
  contentTypeFilter?: string[];
  title?: string;
}

export function ArtifactSelector({
  open,
  onClose,
  onSelect,
  contentTypeFilter,
  title = "Select Artifact",
}: ArtifactSelectorProps) {
  const [artifacts, setArtifacts] = useState<ArtifactMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      artifactApi
        .list({
          filter: contentTypeFilter
            ? { contentType: contentTypeFilter[0] }
            : undefined,
        })
        .then((result) => setArtifacts(result.items))
        .catch(() => setArtifacts([]))
        .finally(() => setLoading(false));
    }
  }, [open, contentTypeFilter?.join(",")]);

  const filtered = artifacts.filter((a) =>
    searchText
      ? a.fileName.toLowerCase().includes(searchText.toLowerCase())
      : true
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const headers = [
    { key: "fileName", header: "File Name" },
    { key: "size", header: "Size" },
    { key: "refCount", header: "References" },
  ];

  const rows = filtered.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    size: formatSize(a.size),
    refCount: a.refCount,
  }));

  return (
    <ComposedModal open={open} onClose={onClose} size="lg">
      <ModalHeader title={title} />
      <ModalBody>
        <TextInput
          id="artifact-selector-search"
          labelText=""
          placeholder="Search artifacts..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ marginBottom: "1rem" }}
        />

        {loading ? (
          <Loading withOverlay={false} />
        ) : (
          <DataTable rows={rows} headers={headers} radio>
            {({ rows, headers, getTableProps, getHeaderProps, getRowProps, getCellProps, selectRow }) => (
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    <TableHeader />
                    {headers.map((header) => (
                      <TableHeader {...getHeaderProps({ header })}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      {...getRowProps({ row })}
                      onClick={() => setSelectedId(row.id)}
                      style={{
                        cursor: "pointer",
                        background: selectedId === row.id ? "#e8f0fe" : undefined,
                      }}
                    >
                      <TableCell>
                        <input
                          type="radio"
                          name="artifact-select"
                          checked={selectedId === row.id}
                          onChange={() => setSelectedId(row.id)}
                        />
                      </TableCell>
                      {row.cells
                        .filter((c) => c.info.header !== "id")
                        .map((cell) => (
                          <TableCell key={cell.id}>
                            {cell.value}
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataTable>
        )}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          kind="primary"
          disabled={!selectedId}
          onClick={() => {
            const artifact = artifacts.find((a) => a.id === selectedId);
            if (artifact) {
              onSelect({
                artifactId: artifact.id,
                fileName: artifact.fileName,
                size: artifact.size,
                checksum: artifact.checksum,
              });
            }
            onClose();
          }}
        >
          Confirm selection
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
}
