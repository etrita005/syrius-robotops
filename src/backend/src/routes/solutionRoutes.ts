import { Hono } from "hono";
import { SolutionService } from "../services/solutionService.js";
import { RobotService } from "../services/robotService.js";
import { CreateSolutionInput, SolutionListOptions } from "../types/solution.js";
import { AppError } from "../errors/appErrors.js";
import { createRobotRoutes } from "./robotRoutes.js";

export function createSolutionRoutes(solutionService: SolutionService, robotService: RobotService): Hono {
  const router = new Hono();

  router.post("/", async (c) => {
    const input: CreateSolutionInput = await c.req.json();
    if (!input.name || input.name.trim().length === 0) {
      return c.json({ error: "INVALID_NAME", message: "Solution name is required." }, 400);
    }
    if (input.name.length > 128) {
      return c.json({ error: "INVALID_NAME", message: "Solution name must be at most 128 characters." }, 400);
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
    const options: SolutionListOptions = {};
    const filterName = c.req.query("filter[name]");
    const filterTags = c.req.query("filter[tags]");
    const sortField = c.req.query("sort[field]") as SolutionListOptions["sort"] extends undefined ? never : NonNullable<NonNullable<SolutionListOptions["sort"]>["field"]>;
    const sortOrder = c.req.query("sort[order]") as SolutionListOptions["sort"] extends undefined ? never : NonNullable<NonNullable<SolutionListOptions["sort"]>["order"]>;

    if (filterName || filterTags) {
      options.filter = {};
      if (filterName) options.filter.name = filterName;
      if (filterTags) options.filter.tags = filterTags.split(",");
    }
    if (sortField || sortOrder) {
      options.sort = {
        field: sortField ?? "updatedAt",
        order: sortOrder ?? "desc",
      };
    }

    const result = await solutionService.list(options);
    return c.json(result);
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
      return c.body(null, 204);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/:id/clone", async (c) => {
    const sourceId = c.req.param("id");
    const { name } = await c.req.json();
    if (!name || name.trim().length === 0) {
      return c.json({ error: "INVALID_NAME", message: "New solution name is required." }, 400);
    }
    try {
      const meta = await solutionService.clone(sourceId, name);
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
    const { destinationPath } = await c.req.json().catch(() => ({ destinationPath: "/tmp" }));
    try {
      const filePath = await solutionService.exportToArchive(id, destinationPath);
      return c.json({ filePath });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/import", async (c) => {
    const { zipPath, conflictResolution } = await c.req.json();
    if (!zipPath) {
      return c.json({ error: "INVALID_INPUT", message: "zipPath is required." }, 400);
    }
    const resolution = conflictResolution ?? "rename";
    try {
      const meta = await solutionService.importFromArchive(zipPath, resolution);
      return c.json(meta, 201);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  // Mount robot routes as a sub-router under /:id/robots
  router.route("/:id/robots", createRobotRoutes(robotService));

  return router;
}
