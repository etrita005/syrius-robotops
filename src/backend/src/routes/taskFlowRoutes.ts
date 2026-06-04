import { Hono } from "hono";
import type { TaskFlowEngine } from "../services/taskFlowEngine/taskFlowEngine.js";
import {
  AppError,
  MissingTypeOrDagError,
  InvalidFlowTypeError,
  InvalidIdsError,
} from "../errors/appErrors.js";

export function createTaskFlowRoutes(engine: TaskFlowEngine): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    try {
      const body = await c.req.json();
      const { type, dag, input, expectedResults } = body;
      if (!type || !dag) {
        throw new MissingTypeOrDagError();
      }
      if (type !== "internal" && type !== "user") {
        throw new InvalidFlowTypeError();
      }
      const summary = await engine.createFlow(type, dag, input, expectedResults);
      return c.json(summary, 201);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      const message = (err as Error).message;
      if (message.includes("not registered")) {
        return c.json({ error: "RESOLVER_NOT_FOUND", message }, 400);
      }
      return c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
    }
  });

  app.get("/", (c) => {
    const type = c.req.query("type") as "internal" | "user" | undefined;
    const flows = engine.listFlows(type);
    return c.json(flows);
  });

  app.post("/batch/pause", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        throw new InvalidIdsError();
      }
      await engine.batchPause(ids);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
    }
  });

  app.post("/batch/resume", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        throw new InvalidIdsError();
      }
      await engine.batchResume(ids);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
    }
  });

  app.post("/batch/stop", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        throw new InvalidIdsError();
      }
      await engine.batchStop(ids);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
    }
  });

  app.post("/batch/delete", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        throw new InvalidIdsError();
      }
      await engine.batchDelete(ids);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
    }
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const flow = engine.getFlow(id);
    if (!flow) {
      return c.json({ error: "FLOW_NOT_FOUND", message: "Flow not found" }, 404);
    }
    return c.json(flow);
  });

  app.post("/:id/pause", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.pauseFlow(id);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "FLOW_NOT_FOUND", message: "Flow not found" }, 404);
    }
  });

  app.post("/:id/resume", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.resumeFlow(id);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "FLOW_NOT_FOUND", message: "Flow not found" }, 404);
    }
  });

  app.post("/:id/stop", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.stopFlow(id);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "FLOW_NOT_FOUND", message: "Flow not found" }, 404);
    }
  });

  app.delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.deleteFlow(id);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return c.json({ error: err.code, message: err.message }, err.statusCode);
      }
      return c.json({ error: "FLOW_NOT_FOUND", message: "Flow not found" }, 404);
    }
  });

  return app;
}
