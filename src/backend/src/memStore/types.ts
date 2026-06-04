export interface CacheConfig {
  ttlMs: number;
  cron?: string;
  preExpireWarningMs?: number;
}

export interface CacheValuePayload {
  value: unknown;
  hasValue: boolean;
  createdAt: number;
  updatedAt: number;
  expireAt: number;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  hasValue: boolean;
  properties: Readonly<Record<string, unknown>>;
  context: Record<string, unknown>;
  config: CacheConfig;
  createdAt: number;
  updatedAt: number;
  expireAt: number;
}

export interface IMemStore {
  clearRefreshing(key: string): void;
  getCache(key: string): unknown | undefined;
  hasCache(key: string): boolean;
}

export interface CacheEventHandler {
  onCreated(store: IMemStore, entry: CacheEntry): void;
  onUpdate(store: IMemStore, entry: CacheEntry): void;
  onValueChanged(store: IMemStore, entry: CacheEntry): void;
  onDeleted(store: IMemStore, entry: CacheEntry): void;
}

export interface CreateCacheOptions {
  initialValue?: unknown;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

const noopHandler: CacheEventHandler = {
  onCreated(_store: IMemStore) {},
  onUpdate(_store: IMemStore) {},
  onValueChanged(_store: IMemStore) {},
  onDeleted(_store: IMemStore) {},
};

export { noopHandler };
