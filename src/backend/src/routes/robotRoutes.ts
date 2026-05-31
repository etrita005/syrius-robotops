import { Hono } from "hono";
import { RobotService } from "../services/robotService.js";
import { AppError } from "../errors/appErrors.js";

export function createRobotRoutes(robotService: RobotService): Hono {
  const router = new Hono();

  router.get("/", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    try {
      const robots = await robotService.list(solutionId);
      return c.json(robots);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/:robotId", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    const robotId = c.req.param("robotId")!;
    try {
      const robot = await robotService.get(solutionId, robotId);
      return c.json(robot);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    const input = await c.req.json();
    if (!input.address) {
      return c.json({ error: "INVALID_INPUT", message: "address is required." }, 400);
    }
    try {
      const robot = await robotService.create(solutionId, input);
      return c.json(robot, 201);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.put("/:robotId", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    const robotId = c.req.param("robotId")!;
    const patch = await c.req.json();
    try {
      const robot = await robotService.update(solutionId, robotId, patch);
      return c.json(robot);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.delete("/:robotId", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    const robotId = c.req.param("robotId")!;
    try {
      await robotService.remove(solutionId, robotId);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  return router;
}
