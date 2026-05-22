import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { join } from "node:path";
import * as store from "./store.js";

function parseArgs(): { dataDir: string; port: number } {
  const args = process.argv.slice(2);
  let dataDir = join(process.cwd(), "data");
  let port = 3000;

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

app.get("/api/:resource", async (c) => {
  try {
    const resource = c.req.param("resource");
    const items = await store.list(resource);
    return c.json(items);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/:resource", async (c) => {
  try {
    const resource = c.req.param("resource");
    const body = await c.req.json<Record<string, unknown>>();
    const obj = await store.create(resource, body);
    return c.json(obj, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.get("/api/:resource/:id", async (c) => {
  try {
    const { resource, id } = c.req.param();
    const obj = await store.get(resource, id);
    if (!obj) return c.json({ error: "Not found" }, 404);
    return c.json(obj);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.put("/api/:resource/:id", async (c) => {
  try {
    const { resource, id } = c.req.param();
    const body = await c.req.json<Record<string, unknown>>();
    const obj = await store.update(resource, id, body);
    if (!obj) return c.json({ error: "Not found" }, 404);
    return c.json(obj);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.delete("/api/:resource/:id", async (c) => {
  try {
    const { resource, id } = c.req.param();
    const ok = await store.remove(resource, id);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

console.log(`Object store server running at http://localhost:${port}`);
console.log(`Data directory: ${dataDir}`);
serve({ fetch: app.fetch, port });