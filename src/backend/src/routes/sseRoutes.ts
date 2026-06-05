import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { SseManager } from "../services/sseManager.js";

export function createSseRoutes(sseManager: SseManager): Hono {
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
