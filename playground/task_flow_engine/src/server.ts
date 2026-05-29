import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import { TaskFlowEngine } from "./taskFlowEngine.js";
import { createRoutes } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(): { dataDir: string; port: number } {
  const args = process.argv.slice(2);
  let dataDir = join(process.cwd(), "data");
  let port = 30002;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--port" || args[i] === "-p") && i + 1 < args.length) {
      const p = parseInt(args[++i], 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        port = p;
      }
    } else if ((args[i] === "--data-dir" || args[i] === "-d") && i + 1 < args.length) {
      dataDir = args[++i];
    }
  }

  return { dataDir, port };
}

const { dataDir, port } = parseArgs();
store.configure(dataDir);

const engine = new TaskFlowEngine();
await engine.loadFlows();

const app = new Hono();

// API routes under /api
app.route("/api", createRoutes(engine));

// Static frontend
app.use("/*", serveStatic({ root: join(__dirname, "../public") }));

app.onError((err, c) => {
  console.error(`Unhandled error: ${(err as Error).message}`);
  return c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
});

console.log(`Task Flow Engine server running at http://localhost:${port}`);
console.log(`Data directory: ${dataDir}`);
serve({ fetch: app.fetch, port });
