import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { join } from "node:path";
import * as store from "./store.js";

function parseArgs(): { dataDir: string; port: number } {
  const args = process.argv.slice(2);
  let dataDir = join(process.cwd(), "data");
  let port = 30000;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--data-dir" || args[i] === "-d") && i + 1 < args.length) {
      dataDir = args[++i];
    } else if ((args[i] === "--port" || args[i] === "-p") && i + 1 < args.length) {
      const p = parseInt(args[++i], 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        port = p;
      }
    }
  }

  return { dataDir, port };
}

const { dataDir, port } = parseArgs();
store.configure(dataDir);

const app = new Hono();

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

console.log(`Object store server running at http://localhost:${port}`);
console.log(`Data directory: ${dataDir}`);
serve({ fetch: app.fetch, port });
