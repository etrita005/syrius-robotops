import { Hono } from "hono";
import { SolutionService } from "../services/solutionService.js";
import { AppError } from "../errors/appErrors.js";

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
    const { destinationPath } = await c.req.json().catch(() => ({ destinationPath: undefined }));
    try {
      const result = await solutionService.exportSolution(id, destinationPath);
      return c.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/import", async (c) => {
    const { zipPath, targetPath } = await c.req.json();
    if (!zipPath || !targetPath) {
      return c.json({ error: "INVALID_INPUT", message: "zipPath and targetPath are required." }, 400);
    }
    try {
      const result = await solutionService.importSolution(zipPath, targetPath);
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
