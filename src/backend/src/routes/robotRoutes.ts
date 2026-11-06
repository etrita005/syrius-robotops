import { Hono } from "hono";
import { RobotService, buildRobotInfoKey } from "../services/robotService.js";
import { RobotPowerService, type RobotPowerAction } from "../services/robotPowerService.js";
import { AppError } from "../errors/appErrors.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("RobotRoutes");

function isRobotPowerAction(value: unknown): value is RobotPowerAction {
  return value === "shutdown" || value === "reboot";
}

export function createRobotRoutes(
  robotService: RobotService,
  robotPowerService: RobotPowerService
): Hono {
  const router = new Hono();

  router.get("/info", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    try {
      const robots = await robotService.getRobotInfoList(solutionId);
      return c.json(robots);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/info/:robotId", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    const robotId = c.req.param("robotId")!;
    try {
      const robot = await robotService.getRobotInfo(solutionId, robotId);
      return c.json(robot);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/memstore-key/:robotId", (c) => {
    const solutionId = c.req.param("solutionId")!;
    const robotId = c.req.param("robotId")!;
    return c.json({ key: buildRobotInfoKey(solutionId, robotId) });
  });

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

  router.post("/:robotId/power", async (c) => {
    const solutionId = c.req.param("solutionId")!;
    const robotId = c.req.param("robotId")!;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "INVALID_INPUT", message: "A JSON body with an action is required." }, 400);
    }

    const action = (body as { action?: unknown } | null)?.action;
    if (!isRobotPowerAction(action)) {
      return c.json({ error: "INVALID_INPUT", message: "action must be 'shutdown' or 'reboot'." }, 400);
    }

    try {
      await robotPowerService.execute(solutionId, robotId, action);
      return c.json({ ok: true, robotId, action });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      log.error({ robotId, action, err: (err as Error).message }, "Robot power action failed");
      return c.json(
        { error: "POWER_ACTION_FAILED", message: (err as Error).message },
        502
      );
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
