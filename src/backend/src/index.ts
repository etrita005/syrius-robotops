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
import { createSseRoutes } from "./routes/sseRoutes.js";
import { createSystemLogRoutes } from "./routes/systemLogRoutes.js";
import { AppError } from "./errors/appErrors.js";
import * as store from "./objectStore/store.js";
import { TaskFlowEngine, ResolverRegistry, SseManager } from "./services/taskFlowEngine/index.js";
import type { TaskResolverClass } from "flowed";
import { SshCommandTask, MockSshCommandTask, GetRobotBasicInfoTask, MockGetRobotBasicInfoTask, UpdateRobotBasicInfoTask, MockUpdateRobotBasicInfoTask, SshFileTransferTask, MockSshFileTransferTask, UpgradeMovebaseTask, MockUpgradeMovebaseTask, TransferMovebaseTask, MockTransferMovebaseTask, DeleteMovebaseTask, MockDeleteMovebaseTask } from "./tasks/index.js";
import { MemStore } from "./memStore/index.js";
import { SystemLogService } from "./services/systemLogService.js";
import { SSH_USERNAME, SSH_PASSWORD } from "./config.js";
import { createLogger } from "./logger/index.js";

const log = createLogger("App");

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
  { name: "SshCommandTask", real: SshCommandTask, mock: MockSshCommandTask },
  { name: "GetRobotBasicInfoTask", real: GetRobotBasicInfoTask, mock: MockGetRobotBasicInfoTask },
  { name: "UpdateRobotBasicInfoTask", real: UpdateRobotBasicInfoTask, mock: MockUpdateRobotBasicInfoTask },
  { name: "SshFileTransferTask", real: SshFileTransferTask, mock: MockSshFileTransferTask },
  { name: "UpgradeMovebaseTask", real: UpgradeMovebaseTask, mock: MockUpgradeMovebaseTask },
  { name: "TransferMovebaseTask", real: TransferMovebaseTask, mock: MockTransferMovebaseTask },
  { name: "DeleteMovebaseTask", real: DeleteMovebaseTask, mock: MockDeleteMovebaseTask },
]);

const taskFlowEngine = new TaskFlowEngine(objectStore, sseManager, resolverRegistry);

const memStoreInstance = new MemStore();

const robotService = new RobotService(objectStore, taskFlowEngine, sseManager, memStoreInstance, {
  sshUsername: SSH_USERNAME,
  sshPassword: SSH_PASSWORD,
});

taskFlowEngine.setFlowContext({ memStore: memStoreInstance, artifactService });

solutionService.onSolutionRemove((solutionId: string) => {
  robotService.removeSolutionCache(solutionId);
});
solutionService.onSolutionClose((solutionId: string) => {
  robotService.removeSolutionCache(solutionId);
});

const app = new Hono();

app.use("*", cors());

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;
  log.info({ method, path, status, durationMs: duration }, 'HTTP request');
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

const logsDir = join(process.cwd(), "logs");
const systemLogService = new SystemLogService({
  logsDir,
  studioVersion: "1.0.0",
});

app.route("/api/system-logs", createSystemLogRoutes(systemLogService));

app.route("/api/objects", createObjectStoreRoutes(objectStore, dataDir));
app.route("/api/artifacts", createArtifactRoutes(artifactService));
app.route("/api/solutions", createSolutionRoutes(solutionService));
app.route("/api/solutions/:solutionId/robots", createRobotRoutes(robotService));
app.route("/api/memstore", createMemStoreRoutes(memStoreInstance));
app.route("/api/sse", createSseRoutes(sseManager));

await taskFlowEngine.loadPersistedFlows();

app.route("/api/flows", createTaskFlowRoutes(taskFlowEngine));

app.onError((err, _c) => {
  if (err instanceof AppError) {
    log.warn({ code: err.code, message: err.message, statusCode: err.statusCode }, 'Application error');
    return _c.json({ error: err.code, message: err.message }, err.statusCode);
  }
  log.error({ err: err.message }, 'Unhandled error');
  return _c.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." }, 500);
});

log.info({ port, dataDir }, "RobotOps Backend API starting");
if (mock) {
  log.info("Mock mode enabled");
}
serve({ fetch: app.fetch, port });
