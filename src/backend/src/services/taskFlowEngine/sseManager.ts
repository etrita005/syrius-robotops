export interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
}

export class SseManager {
  private clients = new Set<SSEClient>();

  addClient(client: SSEClient): void {
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

  broadcast(event: string, data: unknown): void {
    const enriched =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? { ...(data as Record<string, unknown>), timestamp: new Date().toISOString() }
        : data;
    const payload = `event: ${event}\ndata: ${JSON.stringify(enriched)}\n\n`;
    const encoder = new TextEncoder();
    for (const client of this.clients) {
      try {
        client.controller.enqueue(encoder.encode(payload));
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
