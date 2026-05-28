export interface ArtifactMeta {
  id: string;
  fileName: string;
  size: number;
  checksum: string;
  contentType: string;
  createdAt: string;
  refCount: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface ArtifactReference {
  artifactId: string;
  purpose: string;
  addedAt: string;
}

export interface UploadProgress {
  bytesSent: number;
  totalBytes: number;
  percentage: number;
}

export interface UploadResult {
  status: "success" | "deduplicated" | "failed" | "cancelled";
  artifact?: ArtifactMeta;
  error?: string;
}

export interface ArtifactListOptions {
  filter?: {
    fileName?: string;
    contentType?: string;
    checksum?: string;
    tags?: string[];
  };
  sort?: {
    field: "createdAt" | "refCount" | "fileName" | "size";
    order: "asc" | "desc";
  };
  pagination?: {
    offset: number;
    limit: number;
  };
}

export interface ArtifactListResult {
  items: ArtifactMeta[];
  total: number;
}
