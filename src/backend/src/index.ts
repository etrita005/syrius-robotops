import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { join } from "node:path";
import { ObjectStore } from "./services/objectStore.js";
import { ChecksumService } from "./services/checksumService.js";
import { ArtifactService } from "./services/artifactService.js";
import { SolutionService } from "./services/solutionService.js";
import { RobotService } from "./services/robotService.js";
import { createSolutionRoutes } from "./routes/solutionRoutes.js";
import { createArtifactRoutes } from "./routes/artifactRoutes.js";
import { AppError } from "./errors/appErrors.js";
import * as store from "./objectStore/store.js";

function parseArgs(): { dataDir: string; port: number } {
  const args = process.argv.slice(2);
  let dataDir = join(process.cwd(), "data");
  let port = 30001;

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

const objectStore = new ObjectStore();
const checksumService = new ChecksumService();
const artifactService = new ArtifactService(objectStore, checksumService);
const solutionService = new SolutionService(objectStore, artifactService);
const robotService = new RobotService(objectStore);

const app = new Hono();

app.use("*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api/solutions", createSolutionRoutes(solutionService, robotService));
app.route("/api/artifacts", createArtifactRoutes(artifactService));

app.onError((err, _c) => {
  if (err instanceof AppError) {
    return _c.json({ error: err.code, message: err.message }, err.statusCode);
  }
  console.error(`Unhandled error: ${err.message}`);
  return _c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
});

console.log(`RobotOps Backend API running at http://localhost:${port}`);
console.log(`Data directory: ${dataDir}`);
serve({ fetch: app.fetch, port });
