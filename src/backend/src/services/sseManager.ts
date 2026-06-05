export interface SseClient {
  id: string;
  controller: ReadableStreamDefaultController;
}

export interface ServerEvent<T = unknown> {
  event: string;
  payload: T;
  timestamp: string;
}

export interface ISseManagerEventHandler {
  onClientConnected(sseManager: SseManager, clientId: string): void;
  onClientDisconnected(sseManager: SseManager, clientId: string): void;
}

export class SseManager {
  private clients = new Map<string, SseClient>();
  private handlers: ISseManagerEventHandler[] = [];

  registerHandler(handler: ISseManagerEventHandler): void {
    if (!this.handlers.includes(handler)) {
      this.handlers.push(handler);
    }
  }

  unregisterHandler(handler: ISseManagerEventHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  addClient(client: SseClient): void {
    this.clients.set(client.id, client);
    for (const handler of this.handlers) {
      try {
        handler.onClientConnected(this, client.id);
      } catch (err) {
        console.error(
          `[SseManager] Handler onClientConnected failed for client ${client.id}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  removeClient(id: string): void {
    if (!this.clients.has(id)) return;
    this.clients.delete(id);
    for (const handler of this.handlers) {
      try {
        handler.onClientDisconnected(this, id);
      } catch (err) {
        console.error(
          `[SseManager] Handler onClientDisconnected failed for client ${id}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  sendToClient<T>(clientId: string, event: string, payload: T): boolean {
    if (!event || event.trim() === "") {
      throw new Error("Event name must not be empty");
    }

    const client = this.clients.get(clientId);
    if (!client) return false;

    let data: string;
    try {
      const envelope: ServerEvent<T> = {
        event,
        payload,
        timestamp: new Date().toISOString(),
      };
      data = `event: ${event}\ndata: ${JSON.stringify(envelope)}\n\n`;
    } catch {
      return false;
    }

    try {
      const encoder = new TextEncoder();
      client.controller.enqueue(encoder.encode(data));
      return true;
    } catch {
      this.removeClient(clientId);
      return false;
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
    const failedClientIds: string[] = [];
    for (const client of this.clients.values()) {
      try {
        client.controller.enqueue(bytes);
      } catch {
        failedClientIds.push(client.id);
      }
    }
    for (const id of failedClientIds) {
      this.removeClient(id);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
