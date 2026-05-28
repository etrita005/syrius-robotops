import { Hono } from "hono";
import { RobotService } from "../services/robotService.js";
import { CreateRobotInput, RobotListOptions } from "../types/robot.js";
import { AppError } from "../errors/appErrors.js";

export function createRobotRoutes(robotService: RobotService): Hono {
  const router = new Hono();

  router.post("/", async (c) => {
    const solutionId = c.req.param("id") ?? "";
    const input: CreateRobotInput = await c.req.json();
    if (!input.address || input.address.trim().length === 0) {
      return c.json({ error: "INVALID_ROBOT_ADDRESS", message: "Robot address is required." }, 400);
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

  router.post("/batch", async (c) => {
    const solutionId = c.req.param("id") ?? "";
    const { inputs }: { inputs: CreateRobotInput[] } = await c.req.json();
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return c.json({ error: "INVALID_INPUT", message: "inputs array is required." }, 400);
    }
    try {
      const result = await robotService.createBatch(solutionId, inputs);
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/", async (c) => {
    const solutionId = c.req.param("id") ?? "";
    const options: RobotListOptions = {};
    const filterAlias = c.req.query("filter[alias]");
    const filterAddress = c.req.query("filter[address]");
    const filterModel = c.req.query("filter[model]");
    const filterRobotSN = c.req.query("filter[robotSN]");
    const sortField = c.req.query("sort[field]") as RobotListOptions["sort"] extends undefined ? never : NonNullable<NonNullable<RobotListOptions["sort"]>["field"]>;
    const sortOrder = c.req.query("sort[order]") as RobotListOptions["sort"] extends undefined ? never : NonNullable<NonNullable<RobotListOptions["sort"]>["order"]>;

    if (filterAlias || filterAddress || filterModel || filterRobotSN) {
      options.filter = {};
      if (filterAlias) options.filter.alias = filterAlias;
      if (filterAddress) options.filter.address = filterAddress;
      if (filterModel) options.filter.model = filterModel;
      if (filterRobotSN) options.filter.robotSN = filterRobotSN;
    }
    if (sortField || sortOrder) {
      options.sort = {
        field: sortField ?? "createdAt",
        order: sortOrder ?? "desc",
      };
    }

    try {
      const robots = await robotService.list(solutionId, options);
      return c.json(robots);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.get("/:robotId", async (c) => {
    const solutionId = c.req.param("id") ?? "";
    const robotId = c.req.param("robotId");
    try {
      const robot = await robotService.get(solutionId, robotId);
      if (!robot) {
        return c.json({ error: "ROBOT_NOT_FOUND", message: `Robot '${robotId}' does not exist.` }, 404);
      }
      return c.json(robot);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.put("/:robotId", async (c) => {
    const solutionId = c.req.param("id") ?? "";
    const robotId = c.req.param("robotId");
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
    const solutionId = c.req.param("id") ?? "";
    const robotId = c.req.param("robotId");
    try {
      await robotService.remove(solutionId, robotId);
      return c.body(null, 204);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      throw err;
    }
  });

  router.post("/batch-delete", async (c) => {
    const solutionId = c.req.param("id") ?? "";
    const { robotIds }: { robotIds: string[] } = await c.req.json();
    if (!Array.isArray(robotIds) || robotIds.length === 0) {
      return c.json({ error: "INVALID_INPUT", message: "robotIds array is required." }, 400);
    }
    try {
      const result = await robotService.removeBatch(solutionId, robotIds);
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
