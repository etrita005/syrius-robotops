import { get, post, put, del } from "./client.js";
import {
  SolutionMeta,
  CreateSolutionInput,
  SolutionListResult,
} from "../types/solution.js";

export const solutionApi = {
  async create(input: CreateSolutionInput): Promise<SolutionMeta> {
    return post<SolutionMeta>("/solutions", input);
  },

  async list(): Promise<SolutionListResult> {
    return get<SolutionListResult>("/solutions");
  },

  async get(id: string): Promise<SolutionMeta> {
    return get<SolutionMeta>(`/solutions/${id}`);
  },

  async update(
    id: string,
    patch: Partial<Omit<SolutionMeta, "id" | "createdAt" | "version">>
  ): Promise<SolutionMeta> {
    return put<SolutionMeta>(`/solutions/${id}`, patch);
  },

  async remove(id: string): Promise<void> {
    await del<{ ok: boolean }>(`/solutions/${id}`);
  },

  async clone(sourceId: string, newName: string): Promise<SolutionMeta> {
    return post<SolutionMeta>(`/solutions/${sourceId}/clone`, { newName });
  },

  async open(id: string): Promise<SolutionMeta> {
    return post<SolutionMeta>(`/solutions/${id}/open`);
  },

  async close(id: string): Promise<{ ok: boolean }> {
    return post<{ ok: boolean }>(`/solutions/${id}/close`);
  },

  async getOpened(): Promise<{ id: string; name: string; openedAt: string }[]> {
    return get("/solutions/opened");
  },

  async exportSolution(id: string, destinationPath?: string): Promise<{ filePath: string }> {
    return post<{ filePath: string }>(`/solutions/${id}/export`, { destinationPath });
  },

  async importSolution(zipPath: string, targetPath: string): Promise<{ ok: boolean }> {
    return post<{ ok: boolean }>("/solutions/import", { zipPath, targetPath });
  },

  async exportSolutionBlob(id: string, signal?: AbortSignal): Promise<Blob> {
    const response = await fetch(`/api/solutions/${id}/export`, {
      method: "POST",
      signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(err.message);
    }
    return response.blob();
  },

  async importSolutionFile(
    file: File,
    conflictResolution: string,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; solution: SolutionMeta; warnings?: string[] }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conflictResolution", conflictResolution);
    const response = await fetch("/api/solutions/import", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(err.message);
    }
    return response.json();
  },
};
