import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { join } from "node:path";
import { ObjectStore } from "./services/objectStore.js";
import { ChecksumService } from "./services/checksumService.js";
import { ArtifactService } from "./services/artifactService.js";
import { SolutionService } from "./services/solutionService.js";
import { RobotService } from "./services/robotService.js";
import { createObjectStoreRoutes } from "./routes/objectStoreRoutes.js";
import { createArtifactRoutes } from "./routes/artifactRoutes.js";
import { createSolutionRoutes } from "./routes/solutionRoutes.js";
import { createRobotRoutes } from "./routes/robotRoutes.js";
import { createMemStoreRoutes } from "./routes/memStoreRoutes.js";
import { createTaskFlowRoutes } from "./routes/taskFlowRoutes.js";
import { AppError } from "./errors/appErrors.js";
import * as store from "./objectStore/store.js";
import { TaskFlowEngine, ResolverRegistry, SseManager, setTaskFlowEngine } from "./services/taskFlowEngine/index.js";
import type { TaskResolverClass } from "flowed";
import { SshCommandTask, GetRobotBasicInfoTask, MockGetRobotBasicInfoTask, UpdateRobotBasicInfoTask, SshFileTransferTask, MockSshFileTransferTask } from "./tasks/index.js";
import { streamSSE } from "hono/streaming";
import { setGlobalMemStore } from "./memStore/index.js";
import { SSH_USERNAME, SSH_PASSWORD } from "./config.js";

function parseArgs(): { dataDir: string; port: number; mock: boolean } {
  const args = process.argv.slice(2);
  let dataDir = join(process.cwd(), "data");
  let port = 30001;
  let mock = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--port" || args[i] === "-p") && i + 1 < args.length) {
      const p = parseInt(args[++i], 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        port = p;
      }
    } else if ((args[i] === "--data-dir" || args[i] === "-d") && i + 1 < args.length) {
      dataDir = args[++i];
    } else if (args[i] === "--mock" || args[i] === "-m") {
      mock = true;
    }
  }

  return { dataDir, port, mock };
}

const { dataDir, port, mock } = parseArgs();

store.configure(dataDir);

const objectStore = new ObjectStore();
const checksumService = new ChecksumService();
const artifactService = new ArtifactService(objectStore, checksumService);
const solutionService = new SolutionService(objectStore);

const sseManager = new SseManager();
const resolverRegistry = new ResolverRegistry();

type TaskRegEntry = {
  name: string;
  real: TaskResolverClass;
  mock?: TaskResolverClass;
};

function registerTasks(
  registry: ResolverRegistry,
  mockMode: boolean,
  entries: TaskRegEntry[]
): void {
  for (const entry of entries) {
    const cls = mockMode && entry.mock ? entry.mock : entry.real;
    registry.register(entry.name, cls);
  }
}

registerTasks(resolverRegistry, mock, [
  { name: "SshCommandTask", real: SshCommandTask },
  { name: "GetRobotBasicInfoTask", real: GetRobotBasicInfoTask, mock: MockGetRobotBasicInfoTask },
  { name: "UpdateRobotBasicInfoTask", real: UpdateRobotBasicInfoTask },
  { name: "SshFileTransferTask", real: SshFileTransferTask, mock: MockSshFileTransferTask },
]);

const taskFlowEngine = new TaskFlowEngine(objectStore, sseManager, resolverRegistry);
setTaskFlowEngine(taskFlowEngine);

const robotService = new RobotService(objectStore, {
  sshUsername: SSH_USERNAME,
  sshPassword: SSH_PASSWORD,
});

const memStoreInstance = robotService.memStore;
setGlobalMemStore(memStoreInstance);

solutionService.onSolutionRemove((solutionId: string) => {
  robotService.removeSolutionCache(solutionId);
});
solutionService.onSolutionClose((solutionId: string) => {
  robotService.removeSolutionCache(solutionId);
});

const app = new Hono();

app.use("*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api/objects", createObjectStoreRoutes(objectStore, dataDir));
app.route("/api/artifacts", createArtifactRoutes(artifactService));
app.route("/api/solutions", createSolutionRoutes(solutionService));
app.route("/api/solutions/:solutionId/robots", createRobotRoutes(robotService));
app.route("/api/memstore", createMemStoreRoutes(memStoreInstance));

app.get("/api/sse", (c) => {
  const key = c.req.query("key");
  if (!key) {
    return c.json({ error: "Missing key query parameter" }, 400);
  }
  return streamSSE(c, async (stream) => {
    const unsubscribe = robotService.sseManager.subscribe(key, (data) => {
      stream.writeSSE({ data }).catch(() => unsubscribe());
    }, memStoreInstance);

    while (!stream.aborted) {
      await stream.sleep(5000);
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: "ping" }), event: "ping" });
      } catch {
        break;
      }
    }
    unsubscribe();
  });
});

await taskFlowEngine.loadPersistedFlows();

app.route("/api/flows", createTaskFlowRoutes(taskFlowEngine, sseManager));

app.onError((err, _c) => {
  if (err instanceof AppError) {
    return _c.json({ error: err.code, message: err.message }, err.statusCode);
  }
  console.error(`Unhandled error: ${err.message}`);
  return _c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
});

console.log(`RobotOps Backend API running at http://localhost:${port}`);
console.log(`Data directory: ${dataDir}`);
console.log(`SSH credentials: ${SSH_USERNAME} / ${SSH_PASSWORD ? "***" : "(none)"}`);
if (mock) {
  console.log("Mock mode enabled");
}
serve({ fetch: app.fetch, port });
