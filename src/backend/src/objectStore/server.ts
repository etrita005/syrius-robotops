import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as store from "./store.js";

const OBS_PREFIX = "/api/obs/";

function parseResourcePath(urlPath: string): string[] {
  const relative = urlPath.slice(OBS_PREFIX.length);
  if (!relative) return [];
  return relative
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

function extractContentType(c: import("hono").Context): string {
  const raw = c.req.header("Content-Type") ?? "application/octet-stream";
  return raw.split(";")[0].trim().toLowerCase();
}

export function createObjectStoreApp(): Hono {
  const app = new Hono();

  app.get("/api/obs", async (c) => {
    try {
      const result = await store.get([]);
      if (!result)
        return c.json({ error: "Root directory not accessible" }, 404);
      if (result.type === "directory") return c.json(result.children);
      return c.json({ error: "Unexpected resource type" }, 500);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/api/obs/*", async (c) => {
    try {
      const pathParts = parseResourcePath(c.req.path);
      const result = await store.get(pathParts);
      if (!result) return c.json({ error: "Not found" }, 404);
      if (result.type === "directory") return c.json(result.children);
      return new Response(result.content, {
        headers: { "Content-Type": result.contentType },
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/api/obs/*", async (c) => {
    try {
      const pathParts = parseResourcePath(c.req.path);
      if (pathParts.length === 0) {
        return c.json({ error: "Resource path cannot be empty" }, 400);
      }
      const alreadyExists = await store.exists(pathParts);
      if (alreadyExists) {
        return c.json({ error: "Resource already exists" }, 409);
      }
      const contentType = extractContentType(c);
      const body = Buffer.from(await c.req.arrayBuffer());
      const info = await store.put(pathParts, body, contentType);
      return c.json(info, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/api/obs/*", async (c) => {
    try {
      const pathParts = parseResourcePath(c.req.path);
      if (pathParts.length === 0) {
        return c.json({ error: "Resource path cannot be empty" }, 400);
      }
      const contentType = extractContentType(c);
      const body = Buffer.from(await c.req.arrayBuffer());
      const info = await store.put(pathParts, body, contentType);
      return c.json(info, 200);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/api/obs/*", async (c) => {
    try {
      const pathParts = parseResourcePath(c.req.path);
      if (pathParts.length === 0) {
        return c.json({ error: "Root directory cannot be deleted" }, 400);
      }
      const ok = await store.remove(pathParts);
      if (!ok) return c.json({ error: "Not found" }, 404);
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}

export function startObjectStoreServer(dataDir: string, port: number): Promise<ReturnType<typeof serve>> {
  store.configure(dataDir);
  const app = createObjectStoreApp();

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port }, () => {
      console.log(`Object store server running at http://localhost:${port}`);
      console.log(`Data directory: ${dataDir}`);
      resolve(server);
    });
  });
}
