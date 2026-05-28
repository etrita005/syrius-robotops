import { ObjectStoreClient } from "./objectStoreClient.js";
import {
  SolutionMeta,
  CreateSolutionInput,
  SolutionListOptions,
  SolutionListResult,
} from "../types/solution.js";
import { ArtifactReference } from "../types/artifact.js";
import {
  SolutionNotFoundError,
  SolutionAlreadyExistsError,
  InvalidSolutionIdError,
  SolutionCorruptedError,
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

function bumpPatchVersion(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function validateSolutionId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new InvalidSolutionIdError(id);
  }
}

export class SolutionService {
  private obs: ObjectStoreClient;
  private artifactService: { incrementRefCount: (id: string) => Promise<void>; decrementRefCount: (id: string) => Promise<void> };

  constructor(
    obs: ObjectStoreClient,
    artifactService: { incrementRefCount: (id: string) => Promise<void>; decrementRefCount: (id: string) => Promise<void> }
  ) {
    this.obs = obs;
    this.artifactService = artifactService;
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
    await this.createDirectorySkeleton(id);

    return meta;
  }

  private async createDirectorySkeleton(id: string): Promise<void> {
    for (const ns of SOLUTION_NAMESPACES) {
      await this.obs.put(`v1/solutions/${id}/${ns}/.keep`, "", "text/plain");
    }
  }

  async list(options?: SolutionListOptions): Promise<SolutionListResult> {
    const dirs = await this.obs.list("v1/solutions");
    const solutionDirs = dirs.filter((d) => d.type === "directory");

    const items: SolutionMeta[] = [];
    const corruptedIds: string[] = [];

    for (const dir of solutionDirs) {
      try {
        const meta = await this.readMeta(dir.name);
        items.push(meta);
      } catch {
        corruptedIds.push(dir.name);
      }
    }

    let filtered = items;
    if (options?.filter?.name) {
      const substr = options.filter.name.toLowerCase();
      filtered = filtered.filter((m) => m.name.toLowerCase().includes(substr));
    }
    if (options?.filter?.tags && options.filter.tags.length > 0) {
      filtered = filtered.filter((m) =>
        options.filter!.tags!.some((t) => m.tags.includes(t))
      );
    }

    const sortField = options?.sort?.field ?? "updatedAt";
    const sortOrder = options?.sort?.order ?? "desc";
    filtered.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return { items: filtered, corruptedIds };
  }

  async get(id: string): Promise<SolutionMeta> {
    validateSolutionId(id);
    return this.readMeta(id);
  }

  async update(
    id: string,
    patch: Partial<Omit<SolutionMeta, "id" | "createdAt" | "version">>
  ): Promise<SolutionMeta> {
    validateSolutionId(id);
    const current = await this.readMeta(id);

    const updated: SolutionMeta = {
      ...current,
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      tags: patch.tags ?? current.tags,
      metadata: patch.metadata ?? current.metadata,
      updatedAt: new Date().toISOString(),
      version: bumpPatchVersion(current.version),
    };

    await this.obs.putJson(`v1/solutions/${id}/meta`, updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    validateSolutionId(id);

    const exists = await this.obs.exists(`v1/solutions/${id}/meta`);
    if (!exists) {
      throw new SolutionNotFoundError(id);
    }

    const refs = await this.collectAllArtifactReferences(id);
    const uniqueArtifactIds = [...new Set(refs.map((r) => r.artifactId))];

    for (const artifactId of uniqueArtifactIds) {
      try {
        await this.artifactService.decrementRefCount(artifactId);
      } catch {
        // Log but continue; artifact might already be gone
      }
    }

    await this.obs.deletePath(`v1/solutions/${id}`);
  }

  async clone(sourceId: string, newName: string): Promise<SolutionMeta> {
    validateSolutionId(sourceId);
    const sourceMeta = await this.readMeta(sourceId);
    const newId = generateId(newName);
    validateSolutionId(newId);

    try {
      await this.obs.putJson(`v1/solutions/${newId}/meta`, { ...sourceMeta, id: newId, name: newName });
      await this.createDirectorySkeleton(newId);

      for (const ns of SOLUTION_NAMESPACES) {
        const resources = await this.obs.list(`v1/solutions/${sourceId}/${ns}`);
        for (const res of resources) {
          if (res.type === "file" && res.name !== ".keep") {
            const content = await this.obs.getJson<unknown>(
              `v1/solutions/${sourceId}/${ns}/${res.name}`
            );
            if (content) {
              await this.obs.putJson(`v1/solutions/${newId}/${ns}/${res.name}`, content);
            }
          }
        }
      }

      const now = new Date().toISOString();
      const newMeta: SolutionMeta = {
        ...sourceMeta,
        id: newId,
        name: newName,
        createdAt: now,
        updatedAt: now,
        version: "1.0.0",
      };
      await this.obs.putJson(`v1/solutions/${newId}/meta`, newMeta);

      const refs = await this.collectAllArtifactReferences(newId);
      const uniqueIds = [...new Set(refs.map((r) => r.artifactId))];
      for (const artifactId of uniqueIds) {
        await this.artifactService.incrementRefCount(artifactId);
      }

      return newMeta;
    } catch (err) {
      try {
        await this.obs.deletePath(`v1/solutions/${newId}`);
      } catch {
        // Best-effort cleanup
      }
      throw err;
    }
  }

  async exportToArchive(id: string, destinationPath: string): Promise<string> {
    validateSolutionId(id);
    const meta = await this.readMeta(id);

    const { createWriteStream } = await import("node:fs");
    const archiver = (await import("archiver")).default;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${id}-v${meta.version}-${timestamp}.zip`;
    const outputPath = destinationPath
      ? `${destinationPath}/${fileName}`
      : fileName;

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(output);

      this.archiveSolutionDir(archive, id, `v1/solutions/${id}`)
        .then(() => archive.finalize())
        .catch(reject);
    });

    return outputPath;
  }

  private async archiveSolutionDir(
    archive: archiver.Archiver,
    solutionId: string,
    basePath: string
  ): Promise<void> {
    const meta = await this.obs.getJson<SolutionMeta>(`${basePath}/meta`);
    if (meta) {
      archive.append(JSON.stringify(meta, null, 2), { name: `${solutionId}/meta.json` });
    }

    for (const ns of SOLUTION_NAMESPACES) {
      const resources = await this.obs.list(`${basePath}/${ns}`);
      for (const res of resources) {
        if (res.type === "file" && res.name !== ".keep") {
          const content = await this.obs.get(`${basePath}/${ns}/${res.name}`);
          if (content.ok) {
            const body = await content.text();
            archive.append(body, { name: `${solutionId}/${ns}/${res.name}.json` });
          }
        }
      }
    }
  }

  async importFromArchive(
    zipPath: string,
    conflictResolution: "overwrite" | "rename" | "cancel"
  ): Promise<SolutionMeta> {
    const { createReadStream } = await import("node:fs");
    const { default: AdmZip } = await import("adm-zip");

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    const metaEntry = entries.find(
      (e) => !e.isDirectory && e.entryName.endsWith("meta.json")
    );
    if (!metaEntry) {
      throw new ImportInvalidArchiveError();
    }

    let meta: SolutionMeta;
    try {
      meta = JSON.parse(metaEntry.getData().toString("utf-8"));
    } catch {
      throw new ImportInvalidArchiveError();
    }

    if (!meta.id || !SAFE_ID_RE.test(meta.id)) {
      throw new ImportInvalidArchiveError();
    }

    let resolvedId = meta.id;
    const existingMeta = await this.obs.getJson<SolutionMeta>(
      `v1/solutions/${resolvedId}/meta`
    );

    if (existingMeta) {
      if (conflictResolution === "cancel") {
        throw new ImportIdCollisionError();
      } else if (conflictResolution === "overwrite") {
        await this.remove(resolvedId);
      } else if (conflictResolution === "rename") {
        resolvedId = generateId(meta.name);
        meta.id = resolvedId;
      }
    }

    const now = new Date().toISOString();
    meta.createdAt = now;
    meta.updatedAt = now;
    meta.version = "1.0.0";

    await this.obs.putJson(`v1/solutions/${resolvedId}/meta`, meta);
    await this.createDirectorySkeleton(resolvedId);

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;

      const parts = entryName.split("/").filter(Boolean);
      if (parts.length < 2 || parts[0] === resolvedId && parts[1] === "meta.json") continue;
      if (parts[0] !== resolvedId) continue;

      const ns = parts[1];
      if (!SOLUTION_NAMESPACES.includes(ns)) continue;
      if (parts.length < 3) continue;

      const resourceName = parts[2].replace(/\.json$/, "");
      try {
        const content = JSON.parse(entry.getData().toString("utf-8"));
        await this.obs.putJson(
          `v1/solutions/${resolvedId}/${ns}/${resourceName}`,
          content
        );
      } catch {
        // Skip non-JSON or invalid entries
      }
    }

    const refs = await this.collectAllArtifactReferences(resolvedId);
    const uniqueIds = [...new Set(refs.map((r) => r.artifactId))];
    for (const artifactId of uniqueIds) {
      try {
        await this.artifactService.incrementRefCount(artifactId);
      } catch {
        // Reference might be stale; skip
      }
    }

    return meta;
  }

  private async readMeta(id: string): Promise<SolutionMeta> {
    const meta = await this.obs.getJson<SolutionMeta>(`v1/solutions/${id}/meta`);
    if (!meta) {
      throw new SolutionNotFoundError(id);
    }
    return meta;
  }

  private async collectAllArtifactReferences(
    id: string
  ): Promise<ArtifactReference[]> {
    const refs: ArtifactReference[] = [];

    const artifactNamespaces = ["upgrade-packages", "maps"];
    for (const ns of artifactNamespaces) {
      try {
        const resources = await this.obs.list(`v1/solutions/${id}/${ns}`);
        for (const res of resources) {
          if (res.type === "file" && res.name !== ".keep") {
            try {
              const content = await this.obs.getJson<{
                artifactRef?: ArtifactReference;
              }>(`v1/solutions/${id}/${ns}/${res.name}`);
              if (content?.artifactRef) {
                refs.push(content.artifactRef);
              }
            } catch {
              // Skip unreadable resources
            }
          }
        }
      } catch {
        // Namespace directory might not exist
      }
    }

    return refs;
  }
}
