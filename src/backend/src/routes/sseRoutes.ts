import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { UnifiedSseManager } from "../services/sseManager.js";
import type { MemStore } from "../memStore/memStore.js";

export function createSseRoutes(sseManager: UnifiedSseManager, memStore: MemStore): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    let clientId = "";
    const controller = new AbortController();
    const stream = new ReadableStream({
      start(ctrl) {
        clientId = randomUUID();
        sseManager.addClient({ id: clientId, controller: ctrl });
        const encoder = new TextEncoder();
        ctrl.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`));

        for (const entry of memStore.listCaches()) {
          if (entry.hasValue) {
            const data = JSON.stringify({
              key: entry.key,
              value: entry.value,
              properties: entry.properties,
            });
            ctrl.enqueue(encoder.encode(`event: memstore/entry-current\ndata: ${data}\n\n`));
          }
        }

        const pingInterval = setInterval(() => {
          try {
            ctrl.enqueue(encoder.encode(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`));
          } catch {
            clearInterval(pingInterval);
            controller.abort();
          }
        }, 30000);

        controller.signal.addEventListener("abort", () => {
          clearInterval(pingInterval);
        });
      },
      cancel() {
        sseManager.removeClient(clientId);
        controller.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  return app;
}
