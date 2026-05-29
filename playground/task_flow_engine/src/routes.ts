import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { TaskFlowEngine } from "./taskFlowEngine.js";

export function createRoutes(engine: TaskFlowEngine): Hono {
  const app = new Hono();

  app.post("/flows", async (c) => {
    try {
      const body = await c.req.json();
      const { type, dag, input, expectedResults } = body;
      if (!type || !dag) {
        return c.json({ error: "Missing type or dag" }, 400);
      }
      if (type !== "internal" && type !== "user") {
        return c.json({ error: "Invalid type, must be internal or user" }, 400);
      }
      const summary = await engine.createFlow(type, dag, input, expectedResults);
      return c.json(summary, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/flows", (c) => {
    const type = c.req.query("type") as "internal" | "user" | undefined;
    const flows = engine.listFlows(type);
    return c.json(flows);
  });

  app.get("/flows/:id", (c) => {
    const id = c.req.param("id");
    const flow = engine.getFlow(id);
    if (!flow) {
      return c.json({ error: "Flow not found" }, 404);
    }
    return c.json(flow);
  });

  app.post("/flows/:id/pause", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.pauseFlow(id);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.post("/flows/:id/resume", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.resumeFlow(id);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.post("/flows/:id/stop", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.stopFlow(id);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.delete("/flows/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await engine.deleteFlow(id);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.post("/flows/batch/pause", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        return c.json({ error: "ids must be an array" }, 400);
      }
      await engine.batchPause(ids);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/flows/batch/resume", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        return c.json({ error: "ids must be an array" }, 400);
      }
      await engine.batchResume(ids);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/flows/batch/stop", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        return c.json({ error: "ids must be an array" }, 400);
      }
      await engine.batchStop(ids);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/flows/batch/delete", async (c) => {
    try {
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) {
        return c.json({ error: "ids must be an array" }, 400);
      }
      await engine.batchDelete(ids);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/events", (c) => {
    let clientId = "";
    const stream = new ReadableStream({
      start(controller) {
        clientId = randomUUID();
        engine.addSSEClient({ id: clientId, controller });
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));
      },
      cancel() {
        engine.removeSSEClient(clientId);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  return app;
}
