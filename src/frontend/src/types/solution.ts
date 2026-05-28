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
