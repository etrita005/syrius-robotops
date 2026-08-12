export type MemStoreSseEventType = "current" | "update" | "deleted";

export interface MemStoreSseEventData {
  key: string;
  value: unknown;
  type: MemStoreSseEventType;
  properties?: Record<string, unknown>;
}

export type SseEventListener = (eventType: string, data: Record<string, unknown>) => void;

const SSE_URL = "/api/sse";

const MEMSTORE_EVENT_TYPES = [
  "memstore/entry-current",
  "memstore/entry-updated",
  "memstore/entry-deleted",
] as const;

const TASKFLOW_EVENT_TYPES = [
  "task-flow-engine/flow-current",
  "task-flow-engine/flow-created",
  "task-flow-engine/flow-updated",
  "task-flow-engine/flow-completed",
  "task-flow-engine/flow-removed",
  "task-flow-engine/task-updated",
  "task-flow-engine/task-result",
  "task-flow-engine/error-handling-started",
  "task-flow-engine/error-handling-completed",
] as const;

class SharedSseConnection {
  private eventSource: EventSource | null = null;
  private refCount = 0;
  private memStoreListeners = new Map<string, Set<(data: MemStoreSseEventData) => void>>();
  private eventListeners = new Set<SseEventListener>();

  subscribeMemStoreKey(
    key: string,
    listener: (data: MemStoreSseEventData) => void
  ): () => void {
    let set = this.memStoreListeners.get(key);
    if (!set) {
      set = new Set();
      this.memStoreListeners.set(key, set);
    }
    set.add(listener);
    this.acquire();
    return () => {
      const listeners = this.memStoreListeners.get(key);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.memStoreListeners.delete(key);
        }
      }
      this.release();
    };
  }

  subscribeEvents(listener: SseEventListener): () => void {
    this.eventListeners.add(listener);
    this.acquire();
    return () => {
      this.eventListeners.delete(listener);
      this.release();
    };
  }

  private acquire(): void {
    this.refCount++;
    if (this.eventSource) return;

    const eventSource = new EventSource(SSE_URL);
    this.eventSource = eventSource;

    for (const eventType of MEMSTORE_EVENT_TYPES) {
      eventSource.addEventListener(eventType, this.handleMemStoreEvent);
    }
    for (const eventType of TASKFLOW_EVENT_TYPES) {
      eventSource.addEventListener(eventType, this.handleTaskFlowEvent);
    }
  }

  private release(): void {
    this.refCount--;
    if (this.refCount > 0 || !this.eventSource) return;

    const eventSource = this.eventSource;
    this.eventSource = null;
    for (const eventType of MEMSTORE_EVENT_TYPES) {
      eventSource.removeEventListener(eventType, this.handleMemStoreEvent);
    }
    for (const eventType of TASKFLOW_EVENT_TYPES) {
      eventSource.removeEventListener(eventType, this.handleTaskFlowEvent);
    }
    eventSource.close();
  }

  private handleMemStoreEvent = (event: MessageEvent): void => {
    const payload = this.parsePayload(event.data);
    if (!payload || typeof payload.key !== "string") return;

    const type: MemStoreSseEventType =
      event.type === "memstore/entry-current"
        ? "current"
        : event.type === "memstore/entry-updated"
          ? "update"
          : "deleted";

    const listeners = this.memStoreListeners.get(payload.key);
    if (!listeners) return;
    for (const listener of listeners) {
      const properties =
        typeof payload.properties === "object" && payload.properties !== null
          ? (payload.properties as Record<string, unknown>)
          : undefined;
      listener({ key: payload.key, value: payload.value, type, properties });
    }
  };

  private handleTaskFlowEvent = (event: MessageEvent): void => {
    const payload = this.parsePayload(event.data);
    if (!payload) return;
    for (const listener of this.eventListeners) {
      listener(event.type, payload);
    }
  };

  private parsePayload(raw: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(raw) as { payload?: Record<string, unknown> };
      return parsed.payload ?? parsed;
    } catch {
      return null;
    }
  }
}

const sharedSseConnection = new SharedSseConnection();

export function subscribeMemStoreKey(
  key: string,
  onData: (data: MemStoreSseEventData) => void
): () => void {
  return sharedSseConnection.subscribeMemStoreKey(key, onData);
}

export function subscribeSseEvents(onEvent: SseEventListener): () => void {
  return sharedSseConnection.subscribeEvents(onEvent);
}
