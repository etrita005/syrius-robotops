import { Hono } from "hono";
import { SolutionService } from "../services/solutionService.js";
import { AppError } from "../errors/appErrors.js";
import { withRetry } from "../utils/retry.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("SolutionRoutes");

export function createSolutionRoutes(solutionService: SolutionService): Hono {
  const router = new Hono();

  router.post("/", async (c) => {
    const input = await c.req.json();
    if (!input.name) {
      return c.json({ error: "INVALID_INPUT", message: "name is required." }, 400);
    }
    try {
      const meta = await solutionService.create(input);
      return c.json(meta, 201);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/", async (c) => {
    const result = await solutionService.list();
    return c.json(result);
  });

  router.get("/opened", async (c) => {
    const opened = solutionService.getOpenedSolutions();
    return c.json(opened);
  });

  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const meta = await solutionService.get(id);
      return c.json(meta);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.put("/:id", async (c) => {
    const id = c.req.param("id");
    const patch = await c.req.json();
    try {
      const meta = await solutionService.update(id, patch);
      return c.json(meta);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await solutionService.remove(id);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/:id/open", async (c) => {
    const id = c.req.param("id");
    try {
      const meta = await solutionService.open(id);
      return c.json(meta);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/:id/close", async (c) => {
    const id = c.req.param("id");
    const closed = solutionService.closeSolution(id);
    return c.json({ ok: closed });
  });

  router.post("/:id/clone", async (c) => {
    const id = c.req.param("id");
    const { newName } = await c.req.json();
    if (!newName) {
      return c.json({ error: "INVALID_INPUT", message: "newName is required." }, 400);
    }
    try {
      const meta = await solutionService.clone(id, newName);
      return c.json(meta, 201);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/:id/export", async (c) => {
    const id = c.req.param("id");
    const signal = c.req.raw.signal;

    try {
      const meta = await solutionService.get(id);
      const slug = meta.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${slug}-v${meta.version}-${timestamp}.zip`;

      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 9 } });

      const chunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));

      signal.addEventListener("abort", () => {
        archive.abort();
        log.warn({ solutionId: id }, "Export aborted by client");
      });

      await withRetry(() =>
        solutionService.archiveToStream(archive, `v1/solutions/${id}`)
      );

      await archive.finalize();

      const buffer = Buffer.concat(chunks);

      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      log.error({ solutionId: id, err }, "Export failed");
      return c.json({ error: "EXPORT_FAILED", message: "Export failed." }, 500);
    }
  });

  router.post("/import", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.parseBody()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "INVALID_INPUT", message: "Failed to parse request body." }, 400);
    }

    const file = body["file"] as { name?: string; arrayBuffer?: () => Promise<ArrayBuffer> } | undefined;
    const conflictResolution = (body["conflictResolution"] as string) || "rename";

    if (!file) {
      return c.json({ error: "INVALID_INPUT", message: "No file provided." }, 400);
    }

    const fileName = file.name ?? "";
    if (!fileName.endsWith(".zip")) {
      return c.json({ error: "UNSUPPORTED_FILE_TYPE", message: "Only .zip files are supported." }, 400);
    }

    try {
      const arrayBuffer = file.arrayBuffer ? await file.arrayBuffer() : new ArrayBuffer(0);
      if (arrayBuffer.byteLength === 0) {
        return c.json({ error: "INVALID_INPUT", message: "File is empty." }, 400);
      }

      const buffer = Buffer.from(arrayBuffer);

      const result = await withRetry(() =>
        solutionService.importFromBuffer(
          buffer,
          conflictResolution as "overwrite" | "rename" | "cancel"
        )
      );

      return c.json(result, 200);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      log.error({ err }, "Import failed");
      return c.json({ error: "IMPORT_FAILED", message: "Import failed." }, 500);
    }
  });

  return router;
}
