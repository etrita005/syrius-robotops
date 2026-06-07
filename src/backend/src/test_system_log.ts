import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { SystemLogService } from "./services/systemLogService.js";
import { createSystemLogRoutes } from "./routes/systemLogRoutes.js";
import {
  parsePinoLine,
  assertSafeLogFileName,
  resolveLogFilePath,
  encodeCursor,
  decodeCursor,
} from "./services/systemLogHelpers.js";
import type { LogEntry, LogFileInfo } from "./types/systemLog.js";

function makeLogEntry(time: string, level: number, module: string, msg: string, extra?: Record<string, unknown>): string {
  const obj: Record<string, unknown> = { time, level, module, msg, pid: 12345, hostname: "test", name: "robotops" };
  if (extra) Object.assign(obj, extra);
  return JSON.stringify(obj) + "\n";
}

function setupTestDir(): { dir: string; logsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "systemlog-test-"));
  const logsDir = join(dir, "logs");
  mkdirSync(logsDir);
  return { dir, logsDir };
}

function createService(logsDir: string): SystemLogService {
  return new SystemLogService({ logsDir, studioVersion: "1.0.0-test" });
}

function createApp(service: SystemLogService): Hono {
  const app = new Hono();
  app.route("/api/system-logs", createSystemLogRoutes(service));
  app.onError((err, c) => c.json({ error: "INTERNAL_ERROR", message: err.message }, 500));
  return app;
}

async function fetchJson(app: Hono, path: string): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(new Request(`http://localhost${path}`));
  return { status: res.status, body: await res.json() };
}

async function fetchBlob(app: Hono, path: string, method: string, jsonBody?: unknown): Promise<{ status: number; body: Buffer; headers: Headers }> {
  const res = await app.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: jsonBody ? { "Content-Type": "application/json" } : undefined,
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  }));
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

const TIMEWIN = { from: "2026-06-07T09:00:00Z", to: "2026-06-07T12:00:00Z" };

describe("systemLogHelpers", () => {
  describe("parsePinoLine", () => {
    it("should parse a valid info-level log line", () => {
      const line = JSON.stringify({ time: "2026-06-07T10:00:00.000Z", level: 30, module: "App", msg: "Server started", pid: 12345, hostname: "test" });
      const result = parsePinoLine(line);
      assert.ok(!("parseError" in result));
      const entry = result as LogEntry;
      assert.equal(entry.level, "info");
      assert.equal(entry.module, "App");
      assert.equal(entry.msg, "Server started");
    });

    it("should map level 50 to error", () => {
      const line = JSON.stringify({ level: 50, msg: "fail", time: "2026-01-01T00:00:00Z" });
      assert.equal((parsePinoLine(line) as LogEntry).level, "error");
    });

    it("should handle undefined module", () => {
      const line = JSON.stringify({ level: 30, msg: "no module", time: "2026-01-01T00:00:00Z" });
      assert.equal((parsePinoLine(line) as LogEntry).module, undefined);
    });

    it("should extract extra fields", () => {
      const line = JSON.stringify({ level: 30, msg: "Upgrade", time: "2026-01-01T00:00:00Z", robotSn: "R-001" });
      assert.deepEqual((parsePinoLine(line) as LogEntry).extra, { robotSn: "R-001" });
    });

    it("should handle msg as object via JSON.stringify", () => {
      const line = JSON.stringify({ level: 30, msg: { hello: "world" }, time: "2026-01-01T00:00:00Z" });
      const result = parsePinoLine(line) as LogEntry;
      assert.ok(result.msg.includes("hello"));
    });

    it("should return parseError for invalid JSON", () => {
      assert.ok("parseError" in parsePinoLine("not json"));
    });
  });

  describe("assertSafeLogFileName", () => {
    it("should accept app.1.log", () => assert.doesNotThrow(() => assertSafeLogFileName("app.1.log")));
    it("should reject notes.txt", () => assert.throws(() => assertSafeLogFileName("notes.txt")));
    it("should reject ../etc/passwd", () => assert.throws(() => assertSafeLogFileName("../etc/passwd")));
  });

  describe("resolveLogFilePath", () => {
    it("should reject non-log filenames", () => {
      let thrown = false;
      try {
        assertSafeLogFileName("notes.txt");
      } catch {
        thrown = true;
      }
      assert.ok(thrown, "Expected assertSafeLogFileName to throw for invalid filename");
    });
  });

  describe("encodeCursor / decodeCursor", () => {
    it("should round-trip", () => {
      const encoded = encodeCursor({ f: "app.2.log", o: 12345 });
      const decoded = decodeCursor(encoded);
      assert.ok(decoded);
      assert.equal(decoded!.f, "app.2.log");
      assert.equal(decoded!.o, 12345);
    });
  });
});

describe("SystemLogService", () => {
  let testDir = "";
  let logsDir = "";
  let service: SystemLogService;

  before(() => {
    const s = setupTestDir();
    testDir = s.dir;
    logsDir = s.logsDir;
    service = createService(logsDir);
  });

  afterEach(() => {
    for (const e of readdirSync(logsDir)) unlinkSync(join(logsDir, e));
  });

  after(() => rmSync(testDir, { recursive: true, force: true }));

  describe("listFiles", () => {
    it("should return empty when no files exist", async () => {
      assert.deepEqual(await service.listFiles(), []);
    });

    it("should list log files with metadata", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "First"));
      const files = await service.listFiles();
      assert.equal(files.length, 1);
      assert.equal(files[0].name, "app.1.log");
      assert.ok(files[0].isActive);
    });

    it("should ignore non-matching files", async () => {
      writeFileSync(join(logsDir, "app.1.log"), "{}");
      writeFileSync(join(logsDir, "notes.txt"), "hello");
      writeFileSync(join(logsDir, "app.abc.log"), "{}");
      const files = await service.listFiles();
      assert.equal(files.length, 1);
      assert.equal(files[0].name, "app.1.log");
    });
  });

  describe("listModules", () => {
    it("should include known modules and (none)", async () => {
      writeFileSync(join(logsDir, "app.1.log"),
        makeLogEntry("2026-06-07T10:00:01Z", 30, "App", "msg1") +
        makeLogEntry("2026-06-07T10:00:02Z", 30, "TaskFlowEngine", "msg2"));
      const modules = await service.listModules();
      assert.ok(modules.includes("(none)"));
      assert.ok(modules.includes("App"));
    });
  });

  describe("query", () => {
    it("should filter by time window", async () => {
      writeFileSync(join(logsDir, "app.1.log"),
        makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "early") +
        makeLogEntry("2026-06-07T11:00:00Z", 30, "App", "target") +
        makeLogEntry("2026-06-07T12:00:00Z", 30, "App", "late"));
      const result = await service.query({ from: "2026-06-07T10:50:00Z", to: "2026-06-07T11:10:00Z" });
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].msg, "target");
    });

    it("should filter by level", async () => {
      writeFileSync(join(logsDir, "app.1.log"),
        makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "info") +
        makeLogEntry("2026-06-07T10:00:01Z", 50, "App", "error") +
        makeLogEntry("2026-06-07T10:00:02Z", 40, "App", "warn"));
      const result = await service.query({ ...TIMEWIN, levels: ["error", "warn"] });
      assert.equal(result.entries.length, 2);
    });

    it("should filter by module", async () => {
      writeFileSync(join(logsDir, "app.1.log"),
        makeLogEntry("2026-06-07T10:00:01Z", 30, "App", "app") +
        makeLogEntry("2026-06-07T10:00:02Z", 30, "SshCommand", "ssh"));
      const result = await service.query({ ...TIMEWIN, modules: ["SshCommand"] });
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].module, "SshCommand");
    });

    it("should filter by keyword", async () => {
      writeFileSync(join(logsDir, "app.1.log"),
        makeLogEntry("2026-06-07T10:00:01Z", 30, "App", "Robot upgrade started") +
        makeLogEntry("2026-06-07T10:00:02Z", 30, "App", "Task completed"));
      const result = await service.query({ ...TIMEWIN, q: "upgrade" });
      assert.equal(result.entries.length, 1);
    });

    it("should do case-insensitive keyword search", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:01Z", 30, "App", "ROBOT"));
      const result = await service.query({ ...TIMEWIN, q: "robot" });
      assert.equal(result.entries.length, 1);
    });

    it("should respect limit and return cursor", async () => {
      let content = "";
      for (let i = 0; i < 20; i++) content += makeLogEntry(`2026-06-07T10:00:${String(i).padStart(2, "0")}Z`, 30, "App", `msg-${i}`);
      writeFileSync(join(logsDir, "app.1.log"), content);
      const result = await service.query({ ...TIMEWIN, limit: 5 });
      assert.equal(result.entries.length, 5);
      assert.ok(result.truncated);
      assert.ok(result.nextCursor);
    });

    it("should handle ascending order", async () => {
      writeFileSync(join(logsDir, "app.1.log"),
        makeLogEntry("2026-06-07T10:00:01Z", 30, "App", "first") +
        makeLogEntry("2026-06-07T10:00:03Z", 30, "App", "third") +
        makeLogEntry("2026-06-07T10:00:02Z", 30, "App", "second"));
      const result = await service.query({ ...TIMEWIN, order: "asc" });
      assert.equal(result.entries[0].msg, "first");
    });

    it("should count parse errors", async () => {
      writeFileSync(join(logsDir, "app.1.log"),
        "not json\n" + makeLogEntry("2026-06-07T10:00:01Z", 30, "App", "valid"));
      const result = await service.query(TIMEWIN);
      assert.equal(result.parseErrorCount, 1);
    });

    it("should return empty for future time window", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "test"));
      const result = await service.query({ from: "2099-01-01T00:00:00Z", to: "2099-01-02T00:00:00Z" });
      assert.equal(result.entries.length, 0);
    });
  });

  describe("createBundleStream", () => {
    it("should create a zip with manifest.json", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "test"));
      const result = await service.createBundleStream(TIMEWIN);
      assert.equal(result.contentType, "application/zip");
      assert.ok(result.fileName.includes("robotops-logs-"));
    });
  });

  describe("createFileStream", () => {
    it("should create a stream for a valid file", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "test"));
      const result = await service.createFileStream("app.1.log");
      assert.equal(result.contentType, "application/octet-stream");
      assert.ok(result.size > 0);
    });

    it("should throw for non-existent file", async () => {
      await assert.rejects(() => service.createFileStream("app.99.log"));
    });

    it("should throw for invalid filename", async () => {
      await assert.rejects(() => service.createFileStream("notes.txt"));
    });
  });
});

describe("systemLogRoutes", () => {
  let testDir = "";
  let logsDir = "";
  let service: SystemLogService;
  let app: Hono;

  before(() => {
    const s = setupTestDir();
    testDir = s.dir;
    logsDir = s.logsDir;
    service = createService(logsDir);
    app = createApp(service);
  });

  afterEach(() => {
    for (const e of readdirSync(logsDir)) unlinkSync(join(logsDir, e));
  });

  after(() => rmSync(testDir, { recursive: true, force: true }));

  describe("GET /files", () => {
    it("should return file list", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "test"));
      const { status, body } = await fetchJson(app, "/api/system-logs/files");
      assert.equal(status, 200);
      const data = body as { files: LogFileInfo[] };
      assert.ok(Array.isArray(data.files));
    });

    it("should return empty when no files", async () => {
      const { status, body } = await fetchJson(app, "/api/system-logs/files");
      assert.equal(status, 200);
      assert.deepEqual((body as { files: LogFileInfo[] }).files, []);
    });
  });

  describe("GET /modules", () => {
    it("should return module list", async () => {
      const { status, body } = await fetchJson(app, "/api/system-logs/modules");
      assert.equal(status, 200);
      assert.ok((body as { modules: string[] }).modules.includes("(none)"));
    });
  });

  describe("GET /query", () => {
    it("should return entries", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "hello"));
      const { status, body } = await fetchJson(app, "/api/system-logs/query?from=2026-06-07T09:00:00Z&to=2026-06-07T12:00:00Z&limit=5");
      assert.equal(status, 200);
      assert.ok(Array.isArray((body as { entries: unknown[] }).entries));
    });

    it("should reject invalid level", async () => {
      const { status } = await fetchJson(app, "/api/system-logs/query?levels=verbose");
      assert.equal(status, 400);
    });

    it("should reject from > to", async () => {
      const { status } = await fetchJson(app, "/api/system-logs/query?from=2026-06-07T12:00:00Z&to=2026-06-07T10:00:00Z");
      assert.equal(status, 400);
    });
  });

  describe("POST /download", () => {
    it("should return zip", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "test"));
      const { status, headers } = await fetchBlob(app, "/api/system-logs/download", "POST", TIMEWIN);
      assert.equal(status, 200);
      assert.equal(headers.get("Content-Type"), "application/zip");
    });

    it("should return 400 for missing from", async () => {
      const { status } = await fetchBlob(app, "/api/system-logs/download", "POST", { to: "2026-06-07T12:00:00Z" });
      assert.equal(status, 400);
    });
  });

  describe("GET /files/:name/download", () => {
    it("should download a file", async () => {
      writeFileSync(join(logsDir, "app.1.log"), makeLogEntry("2026-06-07T10:00:00Z", 30, "App", "download test"));
      const { status } = await fetchBlob(app, "/api/system-logs/files/app.1.log/download", "GET");
      assert.equal(status, 200);
    });

    it("should reject invalid filename", async () => {
      const { status } = await fetchBlob(app, "/api/system-logs/files/notes.txt/download", "GET");
      assert.equal(status, 400);
    });

    it("should reject path traversal", async () => {
      const { status } = await fetchBlob(app, "/api/system-logs/files/..%2F..%2Fetc%2Fpasswd/download", "GET");
      assert.equal(status, 400);
    });

    it("should return 404 for non-existent", async () => {
      const { status } = await fetchBlob(app, "/api/system-logs/files/app.99.log/download", "GET");
      assert.equal(status, 404);
    });
  });
});
