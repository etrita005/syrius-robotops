export interface Dag {
  type: 'mock';
  returnValue: unknown;
  delayMs?: number;
}

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
