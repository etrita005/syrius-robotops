export type { CacheConfig, CacheValuePayload, CacheEntry, CacheEventHandler, CreateCacheOptions } from './types.js';
export { noopHandler } from './types.js';
export { MemStore } from './memStore.js';
export { Scheduler } from './scheduler.js';
export { MemStoreSseManager } from './sseManager.js';

let _globalMemStore: import('./memStore.js').MemStore | null = null;

export function setGlobalMemStore(store: import('./memStore.js').MemStore): void {
  _globalMemStore = store;
}

export function getGlobalMemStore(): import('./memStore.js').MemStore {
  if (!_globalMemStore) {
    throw new Error('[MemStore] Global MemStore instance not set. Call setGlobalMemStore() first.');
  }
  return _globalMemStore;
}
