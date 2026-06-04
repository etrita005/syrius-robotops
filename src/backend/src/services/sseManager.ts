export interface SseClient {
  id: string;
  controller: ReadableStreamDefaultController;
}

export interface ServerEvent<T = unknown> {
  event: string;
  payload: T;
  timestamp: string;
}

export class UnifiedSseManager {
  private clients = new Set<SseClient>();

  addClient(client: SseClient): void {
    this.clients.add(client);
  }

  removeClient(id: string): void {
    for (const c of this.clients) {
      if (c.id === id) {
        this.clients.delete(c);
        break;
      }
    }
  }

  broadcast<T>(event: string, payload: T): void {
    if (!event || event.trim() === "") {
      throw new Error("Event name must not be empty");
    }

    let data: string;
    try {
      const envelope: ServerEvent<T> = {
        event,
        payload,
        timestamp: new Date().toISOString(),
      };
      data = `event: ${event}\ndata: ${JSON.stringify(envelope)}\n\n`;
    } catch {
      return;
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    for (const client of this.clients) {
      try {
        client.controller.enqueue(bytes);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
