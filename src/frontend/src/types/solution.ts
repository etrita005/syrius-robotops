export interface SolutionMeta {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface CreateSolutionInput {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SolutionListResult {
  items: SolutionMeta[];
  corruptedIds: string[];
}

export interface RecentSolutionEntry {
  id: string;
  name: string;
  accessedAt: string;
}

export interface ImportResult {
  ok: boolean;
  solution: SolutionMeta;
  warnings?: string[];
}

export interface ImportConflictInfo {
  existingSolution: {
    id: string;
    name: string;
  };
  archiveSolution: {
    id: string;
    name: string;
  };
}

export type ConflictResolution = "overwrite" | "rename" | "cancel";
