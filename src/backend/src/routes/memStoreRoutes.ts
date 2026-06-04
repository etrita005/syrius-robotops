import { Hono } from "hono";
import type { MemStore } from "../memStore/index.js";

export function createMemStoreRoutes(memStore: MemStore): Hono {
  const router = new Hono();

  router.post("/cache", async (c) => {
    const body = await c.req.json();
    const { key, config, initialValue, properties } = body;
    if (!key || !config || typeof config.ttlMs !== "number") {
      return c.json({ error: "Missing required fields: key, config.ttlMs" }, 400);
    }
    try {
      memStore.createCache(key, config, { initialValue, properties });
      return c.json({ success: true, key });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get("/cache", (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    const detail = memStore.getCacheDetail(key);
    if (!detail || !detail.hasValue) {
      return c.json({ error: "Not found or expired" }, 404);
    }
    return c.json({ key, value: detail.value, properties: detail.properties });
  });

  router.get("/cache/detail", (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    const detail = memStore.getCacheDetail(key);
    if (!detail) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      key: detail.key,
      value: detail.value,
      hasValue: detail.hasValue,
      properties: detail.properties,
      context: detail.context,
      config: detail.config,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      expireAt: detail.expireAt,
    });
  });

  router.get("/cache/exists", (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    const exists = memStore.hasCache(key);
    return c.json({ key, exists });
  });

  router.get("/cache/meta", (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    const result = memStore.getCacheMeta(key);
    if (!result) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      key,
      config: result.config,
      payload: result.payload,
      properties: result.properties,
    });
  });

  router.post("/internal/cache", async (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    const body = await c.req.json();
    if (body.value === undefined) {
      return c.json({ error: "Missing value in body" }, 400);
    }
    try {
      memStore.updateCache(key, body.value);
      return c.json({ success: true, key });
    } catch (err: any) {
      return c.json({ error: err.message }, 404);
    }
  });

  router.delete("/cache", (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    memStore.deleteCache(key);
    return c.json({ success: true, key });
  });

  router.delete("/cache/prefix", (c) => {
    const prefix = c.req.query("prefix");
    if (!prefix) {
      return c.json({ error: "Missing prefix query parameter" }, 400);
    }
    const deletedKeys = memStore.deleteByPrefix(prefix);
    return c.json({ deletedKeys });
  });

  router.put("/cache/config", async (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    const body = await c.req.json();
    try {
      memStore.updateConfig(key, body);
      return c.json({ success: true, key });
    } catch (err: any) {
      return c.json({ error: err.message }, 404);
    }
  });

  router.post("/cache/refresh", (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    memStore.triggerRefresh(key);
    return c.json({ success: true, key });
  });

  router.post("/caches/query", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const filter = body.properties as Record<string, unknown> | undefined;
    const caches = memStore.listCaches(filter);
    return c.json({
      caches: caches.map((entry) => ({
        key: entry.key,
        value: entry.value,
        hasValue: entry.hasValue,
        properties: entry.properties,
        config: entry.config,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        expireAt: entry.expireAt,
      })),
    });
  });

  return router;
}
