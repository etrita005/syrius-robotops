import { ObjectStore } from "./objectStore.js";
import { ArtifactService } from "./artifactService.js";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import archiver from "archiver";
import AdmZip from "adm-zip";
import {
  SolutionMeta,
  CreateSolutionInput,
  SolutionListResult,
  OpenedSolutionEntry,
} from "../types/solution.js";
import {
  SolutionNotFoundError,
  SolutionAlreadyExistsError,
  InvalidSolutionIdError,
  ImportInvalidArchiveError,
  ImportIdCollisionError,
} from "../errors/appErrors.js";

const SAFE_ID_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;

const SOLUTION_NAMESPACES = [
  "robots",
  "upgrade-packages",
  "maps",
  "configs",
  "diagnostics",
  "logs",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function generateId(name: string): string {
  const slug = slugify(name);
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${slug || "solution"}-${suffix}`;
}

function validateSolutionId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new InvalidSolutionIdError(id);
  }
}

export class SolutionService {
  private obs: ObjectStore;
  private artifactService: ArtifactService;
  private openedSolutions: Map<string, OpenedSolutionEntry> = new Map();
  private onSolutionRemoveCallbacks: Array<(solutionId: string) => void> = [];
  private onSolutionCloseCallbacks: Array<(solutionId: string) => void> = [];

  constructor(obs: ObjectStore, artifactService: ArtifactService) {
    this.obs = obs;
    this.artifactService = artifactService;
  }

  onSolutionRemove(callback: (solutionId: string) => void): void {
    this.onSolutionRemoveCallbacks.push(callback);
  }

  onSolutionClose(callback: (solutionId: string) => void): void {
    this.onSolutionCloseCallbacks.push(callback);
  }

  async create(input: CreateSolutionInput): Promise<SolutionMeta> {
    const id = input.id ?? generateId(input.name);
    validateSolutionId(id);

    const exists = await this.obs.exists(`v1/solutions/${id}/meta`);
    if (exists) {
      throw new SolutionAlreadyExistsError(id);
    }

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

    await this.obs.putJson(`v1/solutions/${id}/meta`, meta);
    for (const ns of SOLUTION_NAMESPACES) {
      await this.obs.putJson(`v1/solutions/${id}/${ns}/_keep`, "");
    }

    return meta;
  }

  async list(): Promise<SolutionListResult> {
    const dirs = await this.obs.list("v1/solutions");
    const solutionDirs = dirs.filter((d) => d.type === "directory");

    const items: SolutionMeta[] = [];
    const corruptedIds: string[] = [];

    for (const dir of solutionDirs) {
      try {
        const meta = await this.obs.getJson<SolutionMeta>(`v1/solutions/${dir.name}/meta`);
        if (meta) {
          items.push(meta);
        } else {
          corruptedIds.push(dir.name);
        }
      } catch {
        corruptedIds.push(dir.name);
      }
    }

    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { items, corruptedIds };
  }

  async get(id: string): Promise<SolutionMeta> {
    validateSolutionId(id);
    const meta = await this.obs.getJson<SolutionMeta>(`v1/solutions/${id}/meta`);
    if (!meta) {
      throw new SolutionNotFoundError(id);
    }
    return meta;
  }

  async update(
    id: string,
    patch: Partial<Omit<SolutionMeta, "id" | "createdAt" | "version">>
  ): Promise<SolutionMeta> {
    validateSolutionId(id);
    const current = await this.obs.getJson<SolutionMeta>(`v1/solutions/${id}/meta`);
    if (!current) {
      throw new SolutionNotFoundError(id);
    }

    const [major, minor, patchVersion] = current.version.split(".").map(Number);
    const updated: SolutionMeta = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      version: `${major}.${minor}.${patchVersion + 1}`,
      updatedAt: new Date().toISOString(),
    };

    await this.obs.putJson(`v1/solutions/${id}/meta`, updated);

    const entry = this.openedSolutions.get(id);
    if (entry) {
      entry.name = updated.name;
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    validateSolutionId(id);
    const exists = await this.obs.exists(`v1/solutions/${id}/meta`);
    if (!exists) {
      throw new SolutionNotFoundError(id);
    }

    await this.obs.deletePath(`v1/solutions/${id}`);
    this.openedSolutions.delete(id);
    for (const cb of this.onSolutionRemoveCallbacks) {
      cb(id);
    }
  }

  async open(id: string): Promise<SolutionMeta> {
    const meta = await this.get(id);

    this.openedSolutions.set(id, {
      id,
      name: meta.name,
      openedAt: new Date().toISOString(),
    });

    return meta;
  }

  async clone(sourceId: string, newName: string): Promise<SolutionMeta> {
    validateSolutionId(sourceId);

    const sourceMeta = await this.obs.getJson<SolutionMeta>(`v1/solutions/${sourceId}/meta`);
    if (!sourceMeta) {
      throw new SolutionNotFoundError(sourceId);
    }

    const newId = generateId(newName);
    await this.cloneDirectory(`v1/solutions/${sourceId}`, `v1/solutions/${newId}`);

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
    await this.obs.putJson(`v1/solutions/${newId}/meta`, newMeta);

    return newMeta;
  }

  async exportSolution(id: string, destinationPath?: string): Promise<{ filePath: string }> {
    validateSolutionId(id);
    const exists = await this.obs.exists(`v1/solutions/${id}/meta`);
    if (!exists) {
      throw new SolutionNotFoundError(id);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${id}-${timestamp}.zip`;
    const outputPath = destinationPath
      ? `${destinationPath}/${fileName}`
      : join(process.cwd(), "data", fileName);

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(output);

      this.archiveDirectory(archive, `v1/solutions/${id}`, `v1/solutions/${id}`)
        .then(() => archive.finalize())
        .catch(reject);
    });

    return { filePath: outputPath };
  }

  async importSolution(zipPath: string, targetPath: string): Promise<{ ok: boolean }> {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      if (!entryName.endsWith(".json")) continue;

      const relativePath = entryName.replace(/\.json$/, "");
      const objectPath = `${targetPath}/${relativePath}`;
      try {
        const content = JSON.parse(entry.getData().toString("utf-8"));
        await this.obs.putJson(objectPath, content);
      } catch {
        // skip invalid JSON entries
      }
    }

    return { ok: true };
  }

  async archiveToStream(
    archive: import("archiver").Archiver,
    rootPath: string
  ): Promise<void> {
    await this.archiveDirectory(archive, rootPath, rootPath);
  }

  async importFromBuffer(
    zipBuffer: Buffer,
    conflictResolution: "overwrite" | "rename" | "cancel"
  ): Promise<{ ok: boolean; solution: SolutionMeta; warnings: string[] }> {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const jsonEntries = entries.filter(
      (e) => !e.isDirectory && e.entryName.endsWith(".json")
    );

    const metaEntry = jsonEntries.find((e) =>
      e.entryName.match(/(^|\/)meta\.json$/)
    );
    if (!metaEntry) {
      throw new ImportInvalidArchiveError();
    }

    const meta = JSON.parse(metaEntry.getData().toString("utf-8")) as SolutionMeta;
    let solutionId: string = meta.id;

    const rootPrefix = findCommonPrefix(jsonEntries.map((e) => e.entryName));

    const exists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (exists) {
      switch (conflictResolution) {
        case "cancel":
          throw new ImportIdCollisionError(solutionId);
        case "overwrite":
          await this.remove(solutionId);
          break;
        case "rename":
          solutionId = generateId(meta.name);
          break;
      }
    }

    const warnings: string[] = [];
    const artifactRefs: Array<{ artifactId: string }> = [];

    for (const entry of jsonEntries) {
      const content = JSON.parse(entry.getData().toString("utf-8"));

      const relativePath = entry.entryName
        .replace(/\.json$/, "")
        .slice(rootPrefix.length);
      const objectPath = `v1/solutions/${solutionId}/${relativePath}`;

      if (content.artifactId && content.purpose) {
        artifactRefs.push({ artifactId: content.artifactId });
      }

      await this.obs.putJson(objectPath, content);
    }

    const finalMeta: SolutionMeta = {
      ...meta,
      id: solutionId,
      name: meta.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: "1.0.0",
      tags: meta.tags ?? [],
      metadata: meta.metadata ?? {},
    };
    await this.obs.putJson(`v1/solutions/${solutionId}/meta`, finalMeta);

    for (const ref of artifactRefs) {
      try {
        await this.artifactService.incrementRefCount(ref.artifactId);
      } catch {
        warnings.push(
          `Artifact '${ref.artifactId}' not found; reference left unresolved.`
        );
      }
    }

    return { ok: true, solution: finalMeta, warnings };
  }

  getOpenedSolutions(): OpenedSolutionEntry[] {
    return Array.from(this.openedSolutions.values());
  }

  isOpened(id: string): boolean {
    return this.openedSolutions.has(id);
  }

  closeSolution(id: string): boolean {
    const deleted = this.openedSolutions.delete(id);
    if (deleted) {
      for (const cb of this.onSolutionCloseCallbacks) {
        cb(id);
      }
    }
    return deleted;
  }

  private async cloneDirectory(sourcePath: string, targetPath: string): Promise<void> {
    const resources = await this.obs.list(sourcePath);

    for (const res of resources) {
      const srcSub = `${sourcePath}/${res.name}`;
      const tgtSub = `${targetPath}/${res.name}`;

      if (res.type === "directory") {
        await this.cloneDirectory(srcSub, tgtSub);
      } else if (res.type === "file") {
        const data = await this.obs.getJson<unknown>(srcSub);
        if (data !== null) {
          await this.obs.putJson(tgtSub, data);
        }
      }
    }
  }

  private async archiveDirectory(
    archive: import("archiver").Archiver,
    rootPath: string,
    currentPath: string
  ): Promise<void> {
    const resources = await this.obs.list(currentPath);

    for (const res of resources) {
      const fullPath = `${currentPath}/${res.name}`;
      const relativePath = fullPath.replace(`${rootPath}/`, "");

      if (res.type === "directory") {
        await this.archiveDirectory(archive, rootPath, fullPath);
      } else if (res.type === "file") {
        const data = await this.obs.getJson<unknown>(fullPath);
        if (data !== null) {
          archive.append(JSON.stringify(data, null, 2), { name: `${relativePath}.json` });
        }
      }
    }
  }
}

function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const parts = paths[0].split("/");
  let prefixLen = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts.slice(0, i + 1).join("/") + "/";
    if (paths.every((p) => p.startsWith(segment))) {
      prefixLen = segment.length;
    } else {
      break;
    }
  }
  return paths[0].slice(0, prefixLen);
}
