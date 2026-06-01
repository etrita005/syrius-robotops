import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as memStore from './memStore.js';
import type { Dag, CacheConfig } from './types.js';

const app = new Hono();

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  await next();
});

app.post('/api/cache', async (c) => {
  const body = await c.req.json();
  const { key, dag, ttlMs, cron, preExpireWarningMs, initialValue } = body;
  if (!key || typeof key !== 'string') {
    return c.json({ error: 'Missing or invalid key' }, 400);
  }
  if (!ttlMs || typeof ttlMs !== 'number') {
    return c.json({ error: 'Missing or invalid ttlMs' }, 400);
  }
  const config: CacheConfig = { ttlMs, cron, preExpireWarningMs };
  memStore.createCache(key, (dag as Dag) ?? { type: 'mock', returnValue: null }, config, initialValue);
  return c.json({ success: true, key });
});

app.get('/api/cache/:key', (c) => {
  const key = c.req.param('key');
  const value = memStore.getCache(key);
  if (value === undefined) {
    return c.json({ error: 'Not found or expired' }, 404);
  }
  return c.json({ key, value });
});

app.delete('/api/cache/:key', (c) => {
  const key = c.req.param('key');
  memStore.deleteCache(key);
  return c.json({ success: true });
});

app.post('/api/cache/:key/refresh', async (c) => {
  const key = c.req.param('key');
  try {
    const value = await memStore.triggerRefresh(key);
    return c.json({ success: true, key, value });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.put('/api/cache/:key/config', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json();
  try {
    memStore.updateConfig(key, body);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
});

app.get('/api/cache/:key/meta', (c) => {
  const key = c.req.param('key');
  const result = memStore.getMeta(key);
  if (!result) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json({
    key,
    config: result.config,
    payload: result.payload,
    dag: result.dag,
  });
});

app.post('/api/internal/cache/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json();
  try {
    memStore.updateCache(key, body.value);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
});

app.get('/api/sse/:key', (c) => {
  const key = c.req.param('key');
  return streamSSE(c, async (stream) => {
    const unsubscribe = memStore.subscribe(key, (data) => {
      stream.writeSSE({ data }).catch(() => unsubscribe());
    });

    while (!stream.aborted) {
      await stream.sleep(5000);
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: 'ping' }), event: 'ping' });
      } catch {
        break;
      }
    }
    unsubscribe();
  });
});

app.get('/', (c) => {
  try {
    const html = readFileSync(resolve('public/index.html'), 'utf-8');
    return c.html(html);
  } catch {
    return c.text('index.html not found', 500);
  }
});

export default app;
