import { get, post, put, del } from "./client.js";
import {
  SolutionMeta,
  CreateSolutionInput,
  SolutionListResult,
} from "../types/solution.js";

export const solutionApi = {
  create(input: CreateSolutionInput): Promise<SolutionMeta> {
    return post<SolutionMeta>("/solutions", input);
  },

  list(options?: {
    filter?: { name?: string; tags?: string[] };
    sort?: { field: string; order: string };
  }): Promise<SolutionListResult> {
    const params = new URLSearchParams();
    if (options?.filter?.name) params.set("filter[name]", options.filter.name);
    if (options?.filter?.tags) params.set("filter[tags]", options.filter.tags.join(","));
    if (options?.sort) {
      params.set("sort[field]", options.sort.field);
      params.set("sort[order]", options.sort.order);
    }
    const qs = params.toString();
    return get<SolutionListResult>(`/solutions${qs ? `?${qs}` : ""}`);
  },

  get(id: string): Promise<SolutionMeta> {
    return get<SolutionMeta>(`/solutions/${encodeURIComponent(id)}`);
  },

  update(
    id: string,
    patch: Partial<Omit<SolutionMeta, "id" | "createdAt" | "version">>
  ): Promise<SolutionMeta> {
    return put<SolutionMeta>(`/solutions/${encodeURIComponent(id)}`, patch);
  },

  remove(id: string): Promise<void> {
    return del<void>(`/solutions/${encodeURIComponent(id)}`);
  },

  clone(sourceId: string, newName: string): Promise<SolutionMeta> {
    return post<SolutionMeta>(
      `/solutions/${encodeURIComponent(sourceId)}/clone`,
      { name: newName }
    );
  },

  exportSolution(id: string, destinationPath?: string): Promise<{ filePath: string }> {
    return post<{ filePath: string }>(
      `/solutions/${encodeURIComponent(id)}/export`,
      { destinationPath }
    );
  },

  importSolution(
    zipPath: string,
    conflictResolution: "overwrite" | "rename" | "cancel" = "rename"
  ): Promise<SolutionMeta> {
    return post<SolutionMeta>("/solutions/import", {
      zipPath,
      conflictResolution,
    });
  },
};
