import { Hono } from "hono";
import type { SystemLogService } from "../services/systemLogService.js";
import type {
  LogLevel,
  LogQueryRequest,
} from "../types/systemLog.js";
import { ALL_LEVELS, SAFE_FILE_NAME_RE } from "../types/systemLog.js";
import { AppError } from "../errors/appErrors.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("SystemLogRoute");

function parseLevels(raw: string | undefined): LogLevel[] | undefined {
  if (!raw) return undefined;
  const vals = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const v of vals) {
    if (!ALL_LEVELS.includes(v as LogLevel)) {
      throw new AppError(
        "INVALID_LOG_QUERY",
        `Invalid level: ${v}. Valid: ${ALL_LEVELS.join(",")}`,
        400,
      );
    }
  }
  return vals as LogLevel[];
}

export function createSystemLogRoutes(service: SystemLogService): Hono {
  const router = new Hono();

  router.get("/files", async (c) => {
    try {
      const files = await service.listFiles();
      return c.json({ files });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/modules", async (c) => {
    try {
      const modules = await service.listModules();
      return c.json({ modules });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/query", async (c) => {
    try {
      const req: LogQueryRequest = {};

      const from = c.req.query("from");
      const to = c.req.query("to");
      if (from) req.from = from;
      if (to) req.to = to;

      const levelsRaw = c.req.query("levels");
      try {
        if (levelsRaw) req.levels = parseLevels(levelsRaw);
      } catch (e) {
        if (e instanceof AppError) {
          return c.json({ error: e.code, message: e.message }, e.statusCode);
        }
        throw e;
      }

      const modulesRaw = c.req.query("modules");
      if (modulesRaw) {
        req.modules = modulesRaw.split(",").map((s) => s.trim()).filter(Boolean);
      }

      const q = c.req.query("q");
      if (q !== undefined) req.q = q;

      const order = c.req.query("order");
      if (order === "asc" || order === "desc") {
        req.order = order;
      } else if (order !== undefined) {
        throw new AppError("INVALID_LOG_QUERY", "order must be asc or desc", 400);
      }

      const limitRaw = c.req.query("limit");
      if (limitRaw !== undefined) {
        const limit = parseInt(limitRaw, 10);
        if (isNaN(limit) || limit < 1) {
          throw new AppError("INVALID_LOG_QUERY", "limit must be a positive integer", 400);
        }
        req.limit = limit;
      }

      const cursor = c.req.query("cursor");
      if (cursor !== undefined) req.cursor = cursor;

      const fromMs = req.from ? Date.parse(req.from) : null;
      const toMs = req.to ? Date.parse(req.to) : null;
      if ((req.from && isNaN(Date.parse(req.from))) || (req.to && isNaN(Date.parse(req.to)))) {
        throw new AppError("INVALID_LOG_QUERY", "Invalid ISO timestamp format", 400);
      }
      if (fromMs !== null && toMs !== null && fromMs > toMs) {
        throw new AppError("INVALID_LOG_QUERY", "from must be before to", 400);
      }

      log.info({ from: req.from, to: req.to, levels: req.levels, modules: req.modules, q: req.q, order: req.order, limit: req.limit }, "Query");

      const result = await service.query(req);
      return c.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/download", async (c) => {
    try {
      const body = await c.req.json();
      const from = body.from;
      const to = body.to;

      if (!from || !to || typeof from !== "string" || typeof to !== "string") {
        throw new AppError("INVALID_LOG_QUERY", "from and to are required string fields", 400);
      }
      if (isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
        throw new AppError("INVALID_LOG_QUERY", "Invalid ISO timestamp format", 400);
      }
      if (Date.parse(from) > Date.parse(to)) {
        throw new AppError("INVALID_LOG_QUERY", "from must be before to", 400);
      }

      log.info({ from, to }, "Bundle download request");

      const result = await service.createBundleStream({ from, to });

      c.header("Content-Type", "application/zip");
      c.header("Content-Disposition", `attachment; filename="${result.fileName}"`);

      return c.body(result.stream as unknown as ReadableStream);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/files/:name/download", async (c) => {
    try {
      const name = c.req.param("name");
      if (!SAFE_FILE_NAME_RE.test(name)) {
        return c.json({
          error: "INVALID_LOG_FILE_NAME",
          message: `Invalid log file name: ${name}`,
        }, 400);
      }

      log.info({ name }, "Single file download request");

      const result = await service.createFileStream(name);

      c.header("Content-Type", "application/octet-stream");
      c.header("Content-Disposition", `attachment; filename="${result.fileName}"`);
      c.header("Content-Length", String(result.size));

      return c.body(result.stream as unknown as ReadableStream);
    } catch (err) {
      if (err instanceof Error && err.message === "LOG_FILE_NOT_FOUND") {
        return c.json({
          error: "LOG_FILE_NOT_FOUND",
          message: `Log file not found`,
        }, 404);
      }
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  return router;
}
