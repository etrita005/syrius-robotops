import { LRUCache } from 'lru-cache';
import type { CacheValuePayload, CacheConfig, CacheEntry, CacheEventHandler, CreateCacheOptions } from './types.js';
import { noopHandler } from './types.js';
import { Scheduler } from './scheduler.js';

export class MemStore {
  private cache: LRUCache<string, CacheValuePayload>;
  private metaStore = new Map<string, CacheConfig>();
  private propertiesStore = new Map<string, Readonly<Record<string, unknown>>>();
  private contextStore = new Map<string, Record<string, unknown>>();
  private refreshing = new Set<string>();
  private scheduler: Scheduler;
  private handler: CacheEventHandler;

  constructor(handler?: CacheEventHandler, options?: { maxEntries?: number }) {
    this.handler = handler ?? noopHandler;
    this.scheduler = new Scheduler();
    const max = options?.maxEntries ?? 1000;
    this.cache = new LRUCache<string, CacheValuePayload>({
      max,
      dispose: (value, key, reason) => {
        this.handleDispose(key as string, value, reason as string);
      },
    });
  }

  setHandler(handler: CacheEventHandler): void {
    this.handler = handler;
  }

  createCache(key: string, config: CacheConfig, options?: CreateCacheOptions): void {
    const now = Date.now();
    const payload: CacheValuePayload = {
      value: options?.initialValue,
      hasValue: options?.initialValue !== undefined,
      createdAt: now,
      updatedAt: now,
      expireAt: now + config.ttlMs,
    };

    const properties: Readonly<Record<string, unknown>> = options?.properties
      ? Object.freeze({ ...options.properties })
      : Object.freeze({});

    this.metaStore.set(key, { ...config });
    this.propertiesStore.set(key, properties);
    this.contextStore.set(key, options?.context ? { ...options.context } : {});
    this.cache.set(key, payload, { ttl: Math.max(1, config.ttlMs) });

    this.setupSchedule(key, config, payload.expireAt);

    const entry = this.buildEntry(key);
    if (entry) {
      this.handler.onCreated(this, entry);
    }
  }

  getCache(key: string): unknown | undefined {
    const payload = this.cache.get(key);
    if (payload && payload.hasValue) {
      return payload.value;
    }
    const meta = this.metaStore.get(key);
    if (meta) {
      this.triggerRefresh(key);
    }
    return undefined;
  }

  getCacheDetail(key: string): CacheEntry | undefined {
    return this.buildEntry(key);
  }

  hasCache(key: string): boolean {
    const payload = this.cache.get(key);
    return payload !== undefined && payload.hasValue;
  }

  getCacheMeta(key: string): { config: CacheConfig; payload?: CacheValuePayload; properties: Readonly<Record<string, unknown>> } | undefined {
    const meta = this.metaStore.get(key);
    if (!meta) return undefined;
    const properties = this.propertiesStore.get(key) ?? Object.freeze({});
    return { config: { ...meta }, payload: this.cache.get(key), properties };
  }

  updateCache(key: string, value: unknown): void {
    const meta = this.metaStore.get(key);
    const oldPayload = this.cache.get(key);
    if (!meta) {
      throw new Error(`Key not found: ${key}`);
    }

    const now = Date.now();
    const newPayload: CacheValuePayload = {
      value,
      hasValue: true,
      createdAt: oldPayload?.createdAt ?? now,
      updatedAt: now,
      expireAt: now + meta.ttlMs,
    };
    this.cache.set(key, newPayload, { ttl: Math.max(1, meta.ttlMs) });

    this.scheduler.clearJobsForKey(key);
    this.setupSchedule(key, meta, newPayload.expireAt);

    const entry = this.buildEntry(key);
    if (entry) {
      this.handler.onValueChanged(this, entry);
    }
  }

  deleteCache(key: string): void {
    const entry = this.buildEntry(key);
    this.cache.delete(key);
    this.metaStore.delete(key);
    this.propertiesStore.delete(key);
    this.contextStore.delete(key);
    this.scheduler.clearJobsForKey(key);
    this.refreshing.delete(key);
    if (entry) {
      this.handler.onDeleted(this, entry);
    }
  }

  deleteByPrefix(prefix: string): string[] {
    const deletedKeys: string[] = [];
    for (const key of this.metaStore.keys()) {
      if (key.startsWith(prefix)) {
        deletedKeys.push(key);
      }
    }
    for (const key of deletedKeys) {
      this.deleteCache(key);
    }
    return deletedKeys;
  }

  updateConfig(key: string, partial: Partial<CacheConfig>): void {
    const meta = this.metaStore.get(key);
    if (!meta) {
      throw new Error(`Key not found: ${key}`);
    }

    if (partial.ttlMs !== undefined) meta.ttlMs = partial.ttlMs;
    if (partial.cron !== undefined) meta.cron = partial.cron;
    if (partial.preExpireWarningMs !== undefined) meta.preExpireWarningMs = partial.preExpireWarningMs;

    const payload = this.cache.get(key);
    const newExpireAt = Date.now() + meta.ttlMs;
    if (payload) {
      payload.expireAt = newExpireAt;
      this.cache.set(key, payload, { ttl: Math.max(1, meta.ttlMs) });
    }

    this.scheduler.clearJobsForKey(key);
    this.setupSchedule(key, meta, newExpireAt);
  }

  triggerRefresh(key: string): void {
    const meta = this.metaStore.get(key);
    if (!meta) {
      return;
    }

    if (this.refreshing.has(key)) {
      return;
    }

    this.refreshing.add(key);
    const entry = this.buildEntry(key);
    if (entry) {
      this.handler.onUpdate(this, entry);
    }
  }

  clearRefreshing(key: string): void {
    this.refreshing.delete(key);
  }

  listCaches(filter?: Record<string, unknown>): CacheEntry[] {
    const results: CacheEntry[] = [];
    for (const key of this.metaStore.keys()) {
      const properties = this.propertiesStore.get(key);
      if (filter && properties) {
        let match = true;
        for (const [fk, fv] of Object.entries(filter)) {
          if (properties[fk] !== fv) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      } else if (filter && !properties) {
        continue;
      }
      const entry = this.buildEntry(key);
      if (entry) {
        results.push(entry);
      }
    }
    return results;
  }

  destroy(): void {
    this.scheduler.destroy();
    this.cache.clear();
    this.metaStore.clear();
    this.propertiesStore.clear();
    this.contextStore.clear();
    this.refreshing.clear();
  }

  private buildEntry(key: string): CacheEntry | undefined {
    const meta = this.metaStore.get(key);
    if (!meta) return undefined;
    const payload = this.cache.get(key);
    const properties = this.propertiesStore.get(key) ?? Object.freeze({});
    const context = this.contextStore.get(key) ?? {};
    return {
      key,
      value: payload?.value,
      hasValue: payload?.hasValue ?? false,
      properties,
      context,
      config: { ...meta },
      createdAt: payload?.createdAt ?? 0,
      updatedAt: payload?.updatedAt ?? 0,
      expireAt: payload?.expireAt ?? 0,
    };
  }

  private setupSchedule(key: string, config: CacheConfig, expireAt: number): void {
    if (config.preExpireWarningMs && config.preExpireWarningMs > 0) {
      const warningDelay = expireAt - Date.now() - config.preExpireWarningMs;
      this.scheduler.scheduleWarning(key, warningDelay, async () => {
        console.log(`[MemStore] Pre-expire warning for key: ${key}`);
        this.triggerRefresh(key);
      });
    }
    if (config.cron) {
      this.scheduler.scheduleCron(key, config.cron, async () => {
        console.log(`[MemStore] Periodic refresh for key: ${key}`);
        this.triggerRefresh(key);
      });
    }
  }

  private handleDispose(key: string, _value: CacheValuePayload, reason: string): void {
    if (reason === 'expire') {
      const entry = this.buildEntryFromMeta(key);
      this.scheduler.clearJobsForKey(key);
      this.metaStore.delete(key);
      this.propertiesStore.delete(key);
      this.contextStore.delete(key);
      this.refreshing.delete(key);
      console.log(`[MemStore] Expired and fully cleaned key: ${key}`);
      if (entry) {
        this.handler.onDeleted(this, entry);
      }
    } else if (reason === 'delete') {
      console.log(`[MemStore] Deleted key: ${key}`);
    } else if (reason === 'evict') {
      console.log(`[MemStore] Evicted value for key: ${key}, keeping meta and jobs`);
    } else if (reason === 'set') {
      this.scheduler.clearJobsForKey(key);
    }
  }

  private buildEntryFromMeta(key: string): CacheEntry | undefined {
    const meta = this.metaStore.get(key);
    if (!meta) return undefined;
    const properties = this.propertiesStore.get(key) ?? Object.freeze({});
    const context = this.contextStore.get(key) ?? {};
    const payload = this.cache.peek(key);
    return {
      key,
      value: payload?.value,
      hasValue: payload?.hasValue ?? false,
      properties,
      context,
      config: { ...meta },
      createdAt: payload?.createdAt ?? 0,
      updatedAt: payload?.updatedAt ?? 0,
      expireAt: payload?.expireAt ?? 0,
    };
  }
}
