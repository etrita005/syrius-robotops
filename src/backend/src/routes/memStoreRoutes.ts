import { Hono } from "hono";
import { memStore } from "../memStore/index.js";

export function createMemStoreRoutes(): Hono {
  const router = new Hono();

  router.get("/cache", (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    const value = memStore.getCache(key);
    if (value === undefined) {
      return c.json({ error: "Not found or expired" }, 404);
    }
    return c.json({ key, value });
  });

  router.post("/cache/refresh", async (c) => {
    const key = c.req.query("key");
    if (!key) {
      return c.json({ error: "Missing key query parameter" }, 400);
    }
    try {
      const value = await memStore.triggerRefresh(key);
      return c.json({ success: true, key, value });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
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
    });
  });

  return router;
}
