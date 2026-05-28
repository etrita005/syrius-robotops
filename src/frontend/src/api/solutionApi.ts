import { listObjects, getObject, putObject, deleteObject, cloneObject, exportObject, importObject } from "./objectStoreApi.js";
import {
  SolutionMeta,
  CreateSolutionInput,
  SolutionListResult,
} from "../types/solution.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function generateId(name: string): string {
  const slug = slugify(name);
  const nanoid = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  };
  return `${slug || "solution"}-${nanoid()}`;
}

const SOLUTION_NAMESPACES = [
  "robots",
  "upgrade-packages",
  "maps",
  "configs",
  "diagnostics",
  "logs",
];

export const solutionApi = {
  async create(input: CreateSolutionInput): Promise<SolutionMeta> {
    const id = input.id ?? generateId(input.name);
    const now = new Date().toISOString();
    const meta: SolutionMeta = {
      id,
      name: input.name,
      description: input.description ?? "",
      createdAt: now,
      updatedAt: now,
      version: "1.0.0",
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    };

    await putObject(`v1/solutions/${id}/meta`, meta);
    for (const ns of SOLUTION_NAMESPACES) {
      await putObject(`v1/solutions/${id}/${ns}/_keep`, "");
    }

    return meta;
  },

  async list(): Promise<SolutionListResult> {
    const dirs = await listObjects("v1/solutions");
    const solutionDirs = dirs.filter((d) => d.type === "directory");

    const items: SolutionMeta[] = [];
    const corruptedIds: string[] = [];

    for (const dir of solutionDirs) {
      try {
        const meta = await getObject<SolutionMeta>(`v1/solutions/${dir.name}/meta`);
        if (meta) items.push(meta);
        else corruptedIds.push(dir.name);
      } catch {
        corruptedIds.push(dir.name);
      }
    }

    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { items, corruptedIds };
  },

  async get(id: string): Promise<SolutionMeta | null> {
    return getObject<SolutionMeta>(`v1/solutions/${id}/meta`);
  },

  async update(
    id: string,
    patch: Partial<Omit<SolutionMeta, "id" | "createdAt" | "version">>
  ): Promise<SolutionMeta> {
    const current = await getObject<SolutionMeta>(`v1/solutions/${id}/meta`);
    if (!current) throw new Error(`Solution '${id}' not found`);

    const [major, minor, patchVersion] = current.version.split(".").map(Number);
    const updated: SolutionMeta = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      version: `${major}.${minor}.${patchVersion + 1}`,
      updatedAt: new Date().toISOString(),
    };

    await putObject(`v1/solutions/${id}/meta`, updated);
    return updated;
  },

  async remove(id: string): Promise<void> {
    await deleteObject(`v1/solutions/${id}`);
  },

  async clone(sourceId: string, newName: string): Promise<SolutionMeta> {
    const newId = generateId(newName);
    await cloneObject(`v1/solutions/${sourceId}`, `v1/solutions/${newId}`);

    const now = new Date().toISOString();
    const newMeta: SolutionMeta = {
      id: newId,
      name: newName,
      description: "",
      createdAt: now,
      updatedAt: now,
      version: "1.0.0",
      tags: [],
      metadata: {},
    };
    await putObject(`v1/solutions/${newId}/meta`, newMeta);

    return newMeta;
  },

  async exportSolution(id: string, destinationPath?: string): Promise<{ filePath: string }> {
    return exportObject(`v1/solutions/${id}`, destinationPath);
  },

  async importSolution(zipPath: string, targetPath: string): Promise<{ ok: boolean }> {
    return importObject(zipPath, targetPath);
  },
};
