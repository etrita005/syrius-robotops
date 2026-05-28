import { Hono } from "hono";
import { ArtifactService } from "../services/artifactService.js";
import { ArtifactListOptions } from "../types/artifact.js";
import { AppError } from "../errors/appErrors.js";

export function createArtifactRoutes(artifactService: ArtifactService): Hono {
  const router = new Hono();

  router.post("/upload", async (c) => {
    const { filePath, tags, metadata, customId } = await c.req.json();
    if (!filePath) {
      return c.json({ error: "INVALID_INPUT", message: "filePath is required." }, 400);
    }
    try {
      const result = await artifactService.upload(filePath, {
        tags,
        metadata,
        customId,
      });
      return c.json(result, result.status === "success" ? 201 : 200);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/upload-batch", async (c) => {
    const { filePaths, tags, metadata } = await c.req.json();
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return c.json({ error: "INVALID_INPUT", message: "filePaths array is required." }, 400);
    }
    try {
      const results = await artifactService.uploadBatch(filePaths, { tags, metadata });
      return c.json(results);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/", async (c) => {
    const options: ArtifactListOptions = {};
    const filterFileName = c.req.query("filter[fileName]");
    const filterContentType = c.req.query("filter[contentType]");
    const filterChecksum = c.req.query("filter[checksum]");
    const filterTags = c.req.query("filter[tags]");
    const sortField = c.req.query("sort[field]") as NonNullable<NonNullable<ArtifactListOptions["sort"]>["field"]>;
    const sortOrder = c.req.query("sort[order]") as NonNullable<NonNullable<ArtifactListOptions["sort"]>["order"]>;
    const paginationOffset = c.req.query("pagination[offset]");
    const paginationLimit = c.req.query("pagination[limit]");

    if (filterFileName || filterContentType || filterChecksum || filterTags) {
      options.filter = {};
      if (filterFileName) options.filter.fileName = filterFileName;
      if (filterContentType) options.filter.contentType = filterContentType;
      if (filterChecksum) options.filter.checksum = filterChecksum;
      if (filterTags) options.filter.tags = filterTags.split(",");
    }
    if (sortField || sortOrder) {
      options.sort = {
        field: sortField ?? "createdAt",
        order: sortOrder ?? "desc",
      };
    }
    if (paginationOffset || paginationLimit) {
      options.pagination = {
        offset: parseInt(paginationOffset ?? "0", 10),
        limit: parseInt(paginationLimit ?? "50", 10),
      };
    }

    const result = await artifactService.list(options);
    return c.json(result);
  });

  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const meta = await artifactService.get(id);
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
      const meta = await artifactService.update(id, patch);
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
      await artifactService.remove(id);
      return c.body(null, 204);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/:id/download", async (c) => {
    const id = c.req.param("id");
    const { destinationPath } = await c.req.json().catch(() => ({ destinationPath: "/tmp" }));
    try {
      const filePath = await artifactService.download(id, destinationPath);
      return c.json({ filePath });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/:id/increment-ref", async (c) => {
    const id = c.req.param("id");
    try {
      await artifactService.incrementRefCount(id);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/:id/decrement-ref", async (c) => {
    const id = c.req.param("id");
    try {
      await artifactService.decrementRefCount(id);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/audit/ref-count", async (c) => {
    try {
      const result = await artifactService.runRefCountAudit();
      return c.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  return router;
}
