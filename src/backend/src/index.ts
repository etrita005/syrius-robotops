import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { join } from "node:path";
import { ObjectStoreClient } from "./services/objectStoreClient.js";
import { ChecksumService } from "./services/checksumService.js";
import { ArtifactService } from "./services/artifactService.js";
import { SolutionService } from "./services/solutionService.js";
import { createSolutionRoutes } from "./routes/solutionRoutes.js";
import { createArtifactRoutes } from "./routes/artifactRoutes.js";
import { AppError } from "./errors/appErrors.js";
import * as objectStore from "./objectStore/store.js";
import { createObjectStoreApp } from "./objectStore/server.js";

function parseArgs(): {
  dataDir: string;
  embeddedObsPort: number;
  obsBaseUrl: string;
  port: number;
  embeddedObs: boolean;
} {
  const args = process.argv.slice(2);
  let dataDir = join(process.cwd(), "data");
  let embeddedObsPort = 30000;
  let obsBaseUrl = "";
  let port = 30001;
  let embeddedObs = true;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--obs-url" || args[i] === "-o") && i + 1 < args.length) {
      obsBaseUrl = args[++i];
      embeddedObs = false;
    } else if ((args[i] === "--port" || args[i] === "-p") && i + 1 < args.length) {
      const p = parseInt(args[++i], 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        port = p;
      }
    } else if ((args[i] === "--data-dir" || args[i] === "-d") && i + 1 < args.length) {
      dataDir = args[++i];
    } else if ((args[i] === "--obs-port") && i + 1 < args.length) {
      const p = parseInt(args[++i], 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        embeddedObsPort = p;
      }
    }
  }

  return { dataDir, embeddedObsPort, obsBaseUrl, port, embeddedObs };
}

const { dataDir, embeddedObsPort, obsBaseUrl, port, embeddedObs } = parseArgs();

async function main() {
  let resolvedObsUrl: string;

  if (embeddedObs) {
    objectStore.configure(dataDir);
    const obsApp = createObjectStoreApp();
    resolvedObsUrl = `http://localhost:${embeddedObsPort}`;
    await new Promise<void>((resolve) => {
      serve({ fetch: obsApp.fetch, port: embeddedObsPort }, () => {
        console.log(`Embedded Object Store running at ${resolvedObsUrl}`);
        console.log(`Data directory: ${dataDir}`);
        resolve();
      });
    });
  } else {
    resolvedObsUrl = obsBaseUrl;
    console.log(`External Object Store URL: ${resolvedObsUrl}`);
  }

  const obsClient = new ObjectStoreClient({ baseUrl: resolvedObsUrl });
  const checksumService = new ChecksumService();
  const artifactService = new ArtifactService(obsClient, checksumService);
  const solutionService = new SolutionService(obsClient, artifactService);

  const app = new Hono();

  app.use("*", cors());

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  const solutionRoutes = createSolutionRoutes(solutionService);
  const artifactRoutes = createArtifactRoutes(artifactService);

  app.route("/api/solutions", solutionRoutes);
  app.route("/api/artifacts", artifactRoutes);

  app.onError((err, _c) => {
    if (err instanceof AppError) {
      return _c.json({ error: err.code, message: err.message }, err.statusCode);
    }
    console.error(`Unhandled error: ${err.message}`);
    return _c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
  });

  serve({ fetch: app.fetch, port }, () => {
    console.log(`RobotOps Backend API running at http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
