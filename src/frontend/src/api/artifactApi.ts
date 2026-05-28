import { get, post, put, del } from "./client.js";
import {
  ArtifactMeta,
  UploadResult,
  ArtifactListResult,
} from "../types/artifact.js";

export const artifactApi = {
  uploadFile(file: File, options?: { tags?: string[]; metadata?: Record<string, unknown>; customId?: string }): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.tags) formData.append("tags", JSON.stringify(options.tags));
    if (options?.metadata) formData.append("metadata", JSON.stringify(options.metadata));
    if (options?.customId) formData.append("customId", options.customId);
    return fetch("/api/artifacts/upload-file", {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    });
  },

  upload(filePath: string, options?: { tags?: string[]; metadata?: Record<string, unknown>; customId?: string }): Promise<UploadResult> {
    return post<UploadResult>("/artifacts/upload", { filePath, ...options });
  },

  list(options?: {
    filter?: { fileName?: string; contentType?: string; checksum?: string; tags?: string[] };
    sort?: { field: string; order: string };
    pagination?: { offset: number; limit: number };
  }): Promise<ArtifactListResult> {
    const params = new URLSearchParams();
    if (options?.filter?.fileName) params.set("filter[fileName]", options.filter.fileName);
    if (options?.filter?.contentType) params.set("filter[contentType]", options.filter.contentType);
    if (options?.filter?.checksum) params.set("filter[checksum]", options.filter.checksum);
    if (options?.filter?.tags) params.set("filter[tags]", options.filter.tags.join(","));
    if (options?.sort) {
      params.set("sort[field]", options.sort.field);
      params.set("sort[order]", options.sort.order);
    }
    if (options?.pagination) {
      params.set("pagination[offset]", String(options.pagination.offset));
      params.set("pagination[limit]", String(options.pagination.limit));
    }
    const qs = params.toString();
    return get<ArtifactListResult>(`/artifacts${qs ? `?${qs}` : ""}`);
  },

  get(id: string): Promise<ArtifactMeta> {
    return get<ArtifactMeta>(`/artifacts/${encodeURIComponent(id)}`);
  },

  update(id: string, patch: { tags?: string[]; metadata?: Record<string, unknown> }): Promise<ArtifactMeta> {
    return put<ArtifactMeta>(`/artifacts/${encodeURIComponent(id)}`, patch);
  },

  remove(id: string): Promise<void> {
    return del<void>(`/artifacts/${encodeURIComponent(id)}`);
  },

  download(id: string, destinationPath?: string): Promise<{ filePath: string }> {
    return post<{ filePath: string }>(
      `/artifacts/${encodeURIComponent(id)}/download`,
      { destinationPath }
    );
  },

  incrementRefCount(id: string): Promise<{ ok: boolean }> {
    return post<{ ok: boolean }>(`/artifacts/${encodeURIComponent(id)}/increment-ref`);
  },

  decrementRefCount(id: string): Promise<{ ok: boolean }> {
    return post<{ ok: boolean }>(`/artifacts/${encodeURIComponent(id)}/decrement-ref`);
  },

  runRefCountAudit(): Promise<{ corrected: number; inconsistencies: number }> {
    return post<{ corrected: number; inconsistencies: number }>("/artifacts/audit/ref-count");
  },
};
