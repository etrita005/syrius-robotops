import { LRUCache } from 'lru-cache';
import type { CacheValuePayload, CacheConfig, Dag } from './types.js';
import { executeDag } from './taskEngine.js';
import { scheduleCron, scheduleWarning, clearJobsForKey } from './scheduler.js';

interface Subscriber {
  onData: (data: string) => void;
}

const cache = new LRUCache<string, CacheValuePayload>({
  max: 1000,
  dispose: (value, key, reason) => {
    if (reason === 'expire') {
      clearJobsForKey(key as string);
      metaStore.delete(key as string);
      console.log(`[MemStore] Expired and fully cleaned key: ${key}`);
    } else if (reason === 'delete') {
      console.log(`[MemStore] Deleted key: ${key}`);
    } else if (reason === 'evict') {
      console.log(`[MemStore] Evicted value for key: ${key}, keeping meta and jobs`);
    } else if (reason === 'set') {
      clearJobsForKey(key as string);
    }
  },
});

const metaStore = new Map<string, { dag: Dag; config: CacheConfig }>();
const subscribers = new Map<string, Set<Subscriber>>();
const refreshing = new Map<string, Promise<unknown>>();

function getSubs(key: string): Set<Subscriber> {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  return subscribers.get(key)!;
}

export function subscribe(key: string, onData: (data: string) => void): () => void {
  const sub: Subscriber = { onData };
  const set = getSubs(key);
  set.add(sub);

  const payload = cache.get(key);
  if (payload && payload.hasValue) {
    const data = JSON.stringify({ key, value: payload.value, type: 'current' });
    try {
      onData(data);
    } catch {
      set.delete(sub);
    }
  }

  return () => {
    set.delete(sub);
  };
}

function broadcast(key: string, data: unknown) {
  const payload = JSON.stringify(data);
  const set = getSubs(key);
  for (const sub of set) {
    try {
      sub.onData(payload);
    } catch {
      set.delete(sub);
    }
  }
}

export function getCache(key: string): unknown | undefined {
  const payload = cache.get(key);
  if (payload && payload.hasValue) {
    return payload.value;
  }
  const meta = metaStore.get(key);
  if (meta) {
    triggerRefresh(key).catch((err: Error) => console.error(`[MemStore] MissRefresh ${key}:`, err.message));
  }
  return undefined;
}

export function hasCache(key: string): boolean {
  const payload = cache.get(key);
  return payload !== undefined && payload.hasValue;
}

export function getCacheMeta(key: string): { dag: Dag; config: CacheConfig; payload?: CacheValuePayload } | undefined {
  const meta = metaStore.get(key);
  if (!meta) return undefined;
  return { ...meta, payload: cache.get(key) };
}

export function createCache(
  key: string,
  dag: Dag,
  config: CacheConfig,
  initialValue?: unknown
): void {
  const now = Date.now();
  const payload: CacheValuePayload = {
    value: initialValue,
    hasValue: initialValue !== undefined,
    createdAt: now,
    updatedAt: now,
    expireAt: now + config.ttlMs,
  };
  metaStore.set(key, { dag, config });
  cache.set(key, payload, { ttl: Math.max(1, config.ttlMs) });
  setupSchedule(key, config, payload.expireAt);
}

export function updateCache(key: string, value: unknown): void {
  const meta = metaStore.get(key);
  const oldPayload = cache.get(key);
  if (!meta) {
    throw new Error(`Key not found: ${key}`);
  }

  const now = Date.now();
  const newPayload: CacheValuePayload = {
    value,
    hasValue: true,
    createdAt: oldPayload?.createdAt ?? now,
    updatedAt: now,
    expireAt: now + meta.config.ttlMs,
  };
  cache.set(key, newPayload, { ttl: Math.max(1, meta.config.ttlMs) });

  clearJobsForKey(key);
  setupSchedule(key, meta.config, newPayload.expireAt);

  broadcast(key, { key, value, type: 'update' });
}

export function deleteCache(key: string): void {
  cache.delete(key);
  metaStore.delete(key);
  clearJobsForKey(key);
  broadcast(key, { key, type: 'deleted' });
}

export function deleteByPrefix(prefix: string): string[] {
  const deletedKeys: string[] = [];
  for (const key of metaStore.keys()) {
    if (key.startsWith(prefix)) {
      deletedKeys.push(key);
    }
  }
  for (const key of deletedKeys) {
    deleteCache(key);
  }
  return deletedKeys;
}

export function updateConfig(key: string, partial: Partial<CacheConfig>): void {
  const meta = metaStore.get(key);
  const payload = cache.get(key);
  if (!meta) {
    throw new Error(`Key not found: ${key}`);
  }

  if (partial.ttlMs !== undefined) meta.config.ttlMs = partial.ttlMs;
  if (partial.cron !== undefined) meta.config.cron = partial.cron;
  if (partial.preExpireWarningMs !== undefined) meta.config.preExpireWarningMs = partial.preExpireWarningMs;

  const newExpireAt = Date.now() + meta.config.ttlMs;
  if (payload) {
    payload.expireAt = newExpireAt;
    cache.set(key, payload, { ttl: Math.max(1, meta.config.ttlMs) });
  }

  clearJobsForKey(key);
  setupSchedule(key, meta.config, newExpireAt);
}

export async function triggerRefresh(key: string): Promise<unknown> {
  const meta = metaStore.get(key);
  if (!meta) {
    return;
  }

  if (refreshing.has(key)) {
    return refreshing.get(key);
  }

  const promise = (async () => {
    try {
      console.log(`[MemStore] Starting refresh for key: ${key}`);
      const result = await executeDag(meta.dag);
      updateCache(key, result);
      console.log(`[MemStore] Completed refresh for key: ${key}`);
      return result;
    } catch (err) {
      console.error(`[MemStore] Failed refresh for key ${key}:`, err);
      throw err;
    } finally {
      refreshing.delete(key);
    }
  })();

  refreshing.set(key, promise);
  return promise;
}

function setupSchedule(key: string, config: CacheConfig, expireAt: number) {
  if (config.preExpireWarningMs && config.preExpireWarningMs > 0) {
    const warningDelay = expireAt - Date.now() - config.preExpireWarningMs;
    scheduleWarning(key, warningDelay, async () => {
      console.log(`[MemStore] Pre-expire warning for key: ${key}`);
      await triggerRefresh(key);
    });
  }
  if (config.cron) {
    scheduleCron(key, config.cron, async () => {
      console.log(`[MemStore] Periodic refresh for key: ${key}`);
      await triggerRefresh(key);
    });
  }
}
