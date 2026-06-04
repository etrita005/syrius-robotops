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

export interface CacheEventHandler {
  onCreated(entry: CacheEntry): void;
  onUpdate(entry: CacheEntry): void;
  onValueChanged(entry: CacheEntry): void;
  onDeleted(entry: CacheEntry): void;
}

export interface CreateCacheOptions {
  initialValue?: unknown;
  properties?: Record<string, unknown>;
}

const noopHandler: CacheEventHandler = {
  onCreated() {},
  onUpdate() {},
  onValueChanged() {},
  onDeleted() {},
};

export { noopHandler };
