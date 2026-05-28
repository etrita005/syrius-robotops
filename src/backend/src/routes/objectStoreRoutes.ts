import { Hono } from "hono";
import { ObjectStore } from "../services/objectStore.js";
import { AppError } from "../errors/appErrors.js";
import { createWriteStream } from "node:fs";
import { join } from "node:path";

export function createObjectStoreRoutes(obs: ObjectStore, dataDir: string): Hono {
  const router = new Hono();

  router.get("/list/*", async (c) => {
    const path = c.req.path.replace("/api/objects/list/", "");
    try {
      const resources = await obs.list(path);
      return c.json(resources);
    } catch {
      return c.json([]);
    }
  });

  router.get("/*", async (c) => {
    const path = c.req.path.replace("/api/objects/", "");
    if (!path) {
      return c.json({ error: "INVALID_PATH", message: "Object path is required." }, 400);
    }

    const data = await obs.getJson<unknown>(path);
    if (data === null) {
      return c.json({ error: "NOT_FOUND", message: `Object '${path}' not found.` }, 404);
    }
    return c.json(data);
  });

  router.put("/*", async (c) => {
    const path = c.req.path.replace("/api/objects/", "");
    if (!path) {
      return c.json({ error: "INVALID_PATH", message: "Object path is required." }, 400);
    }

    const text = await c.req.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : "";
    } catch {
      data = text;
    }
    await obs.putJson(path, data);
    return c.json({ ok: true });
  });

  router.delete("/*", async (c) => {
    const path = c.req.path.replace("/api/objects/", "");
    if (!path) {
      return c.json({ error: "INVALID_PATH", message: "Object path is required." }, 400);
    }

    const deleted = await obs.deletePath(path);
    if (!deleted) {
      return c.json({ error: "NOT_FOUND", message: `Object '${path}' not found.` }, 404);
    }
    return c.json({ ok: true });
  });

  router.post("/clone", async (c) => {
    const { sourcePath, targetPath } = await c.req.json();
    if (!sourcePath || !targetPath) {
      return c.json({ error: "INVALID_INPUT", message: "sourcePath and targetPath are required." }, 400);
    }

    await cloneDirectory(obs, sourcePath, targetPath);
    return c.json({ ok: true });
  });

  router.post("/export", async (c) => {
    const { sourcePath, destinationPath } = await c.req.json();
    if (!sourcePath) {
      return c.json({ error: "INVALID_INPUT", message: "sourcePath is required." }, 400);
    }

    const archiver = (await import("archiver")).default;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sourceName = sourcePath.split("/").filter(Boolean).pop() ?? "export";
    const fileName = `${sourceName}-${timestamp}.zip`;
    const outputPath = destinationPath
      ? `${destinationPath}/${fileName}`
      : join(dataDir, fileName);

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(output);

      archiveDirectory(obs, archive, sourcePath, sourcePath)
        .then(() => archive.finalize())
        .catch(reject);
    });

    return c.json({ filePath: outputPath });
  });

  router.post("/import", async (c) => {
    const { zipPath, targetPath } = await c.req.json();
    if (!zipPath || !targetPath) {
      return c.json({ error: "INVALID_INPUT", message: "zipPath and targetPath are required." }, 400);
    }

    const { default: AdmZip } = await import("adm-zip");
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
        await obs.putJson(objectPath, content);
      } catch {
        // skip invalid JSON entries
      }
    }

    return c.json({ ok: true });
  });

  return router;
}

async function cloneDirectory(obs: ObjectStore, sourcePath: string, targetPath: string): Promise<void> {
  const resources = await obs.list(sourcePath);

  for (const res of resources) {
    const srcSub = `${sourcePath}/${res.name}`;
    const tgtSub = `${targetPath}/${res.name}`;

    if (res.type === "directory") {
      await cloneDirectory(obs, srcSub, tgtSub);
    } else if (res.type === "file") {
      const data = await obs.getJson<unknown>(srcSub);
      if (data !== null) {
        await obs.putJson(tgtSub, data);
      }
    }
  }
}

async function archiveDirectory(
  obs: ObjectStore,
  archive: import("archiver").Archiver,
  rootPath: string,
  currentPath: string
): Promise<void> {
  const resources = await obs.list(currentPath);

  for (const res of resources) {
    const fullPath = `${currentPath}/${res.name}`;
    const relativePath = fullPath.replace(`${rootPath}/`, "");

    if (res.type === "directory") {
      await archiveDirectory(obs, archive, rootPath, fullPath);
    } else if (res.type === "file") {
      const data = await obs.getJson<unknown>(fullPath);
      if (data !== null) {
        archive.append(JSON.stringify(data, null, 2), { name: `${relativePath}.json` });
      }
    }
  }
}
