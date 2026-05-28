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

export interface UploadResult {
  status: "success" | "deduplicated" | "failed" | "cancelled";
  artifact?: ArtifactMeta;
  error?: string;
}

export interface ArtifactListResult {
  items: ArtifactMeta[];
  total: number;
}

export interface ArtifactReference {
  artifactId: string;
  purpose: string;
  addedAt: string;
}
