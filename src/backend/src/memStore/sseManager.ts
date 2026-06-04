import type { MemStore } from "./memStore.js";

interface SseSubscriber {
  onData: (data: string) => void;
}

export class MemStoreSseManager {
  private subscribers = new Map<string, Set<SseSubscriber>>();

  subscribe(key: string, onData: (data: string) => void, memStore: MemStore): () => void {
    const sub: SseSubscriber = { onData };
    if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
    const set = this.subscribers.get(key)!;
    set.add(sub);

    const detail = memStore.getCacheDetail(key);
    if (detail && detail.hasValue) {
      const data = JSON.stringify({ key, value: detail.value, properties: detail.properties, type: "current" });
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

  broadcast(key: string, data: unknown): void {
    const set = this.subscribers.get(key);
    if (!set) return;
    const payload = JSON.stringify(data);
    for (const sub of set) {
      try {
        sub.onData(payload);
      } catch {
        set.delete(sub);
      }
    }
  }
}
