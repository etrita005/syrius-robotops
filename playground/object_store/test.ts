import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = parseInt(process.argv[2] ?? "3000", 10);
const BASE = `http://localhost:${PORT}/api`;
const DATA_DIR = mkdtempSync(join(tmpdir(), "object-store-test-"));

interface TestResult {
  name: string;
  pass: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function record(name: string, pass: boolean, detail?: string) {
  const status = pass ? "PASS" : "FAIL";
  console.log(`  [${status}] ${name}${detail ? ` — ${detail}` : ""}`);
  results.push({ name, pass, detail });
}

function assert(condition: boolean, msg: string): boolean {
  if (!condition) record(msg, false, "Assertion failed");
  return condition;
}

function startServer(): Promise<{ pid: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["tsx", "server.ts", "--data-dir", DATA_DIR, "--port", String(PORT)], {
      cwd: import.meta.dirname,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error("Server start timeout"));
    }, 10000);

    proc.stdout?.on("data", (data: Buffer) => {
      if (!resolved && data.toString().includes("running")) {
        resolved = true;
        clearTimeout(timeout);
        setTimeout(() => resolve({ pid: proc.pid! }), 500);
      }
    });

    proc.on("error", reject);
  });
}

async function test() {
  console.log("=== Object Store Integration Test ===\n");

  // ---------- 1. CREATE ----------
  console.log("1. CREATE — POST /api/:resource");

  const r1 = await fetch(`${BASE}/robots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-A", model: "X100" }),
  });
  record("create robot-A", r1.status === 201);
  const robot1 = await r1.json();
  assert(typeof robot1.id === "string" && robot1.id.length > 0, "robot-A has auto-generated id");
  assert(robot1.name === "Robot-A", "robot-A name preserved");
  assert(robot1.model === "X100", "robot-A model preserved");

  const r2 = await fetch(`${BASE}/robots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-B", model: "X200", firmware: "v1.0" }),
  });
  record("create robot-B", r2.status === 201);
  const robot2 = await r2.json();
  assert(robot2.name === "Robot-B" && robot2.firmware === "v1.0", "robot-B with extra field");

  const r3 = await fetch(`${BASE}/robots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-C" }),
  });
  record("create robot-C", r3.status === 201);
  const robot3 = await r3.json();

  // ---------- 2. LIST ----------
  console.log("\n2. LIST — GET /api/:resource");

  const listRes = await fetch(`${BASE}/robots`);
  record("list robots status 200", listRes.status === 200);
  const list = await listRes.json() as Array<{ id: string }>;
  assert(Array.isArray(list), "list returns array");
  assert(list.length === 3, `list count = 3 (got ${list.length})`);
  const ids = new Set(list.map((r) => r.id));
  assert(ids.has(robot1.id) && ids.has(robot2.id) && ids.has(robot3.id), "list contains all created ids");

  // ---------- 3. GET ----------
  console.log("\n3. GET — GET /api/:resource/:id");

  const getRes = await fetch(`${BASE}/robots/${robot1.id}`);
  record("get existing object", getRes.status === 200);
  const getRobot = await getRes.json();
  assert(getRobot.name === robot1.name, "get returns correct object");

  const notFound = await fetch(`${BASE}/robots/nonexistent-id`);
  record("get nonexistent returns 404", notFound.status === 404);

  // ---------- 4. UPDATE ----------
  console.log("\n4. UPDATE — PUT /api/:resource/:id");

  const updateRes = await fetch(`${BASE}/robots/${robot1.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-A-Pro", model: "X100", firmware: "v2.0" }),
  });
  record("update existing object", updateRes.status === 200);
  const updated = await updateRes.json();
  assert(updated.id === robot1.id, "updated object keeps same id");
  assert(updated.name === "Robot-A-Pro", "updated name changed");
  assert(updated.firmware === "v2.0", "updated new field added");

  const updateNotFound = await fetch(`${BASE}/robots/nonexistent`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Ghost" }),
  });
  record("update nonexistent returns 404", updateNotFound.status === 404);

  // ---------- 5. DELETE ----------
  console.log("\n5. DELETE — DELETE /api/:resource/:id");

  const delRes = await fetch(`${BASE}/robots/${robot2.id}`, { method: "DELETE" });
  record("delete existing object", delRes.status === 204);

  const delNotFound = await fetch(`${BASE}/robots/nonexistent`, { method: "DELETE" });
  record("delete nonexistent returns 404", delNotFound.status === 404);

  const listAfterDel = await (await fetch(`${BASE}/robots`)).json() as Array<{ id: string }>;
  assert(listAfterDel.length === 2, `remaining count = 2 (got ${listAfterDel.length})`);

  // ---------- 6. Cross-resource isolation ----------
  console.log("\n6. Cross-resource isolation");

  const m1 = await (await fetch(`${BASE}/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Floor-1", version: 3 }),
  })).json();
  record("create map in different resource", true, `Created map ${m1.id}`);

  const maps = await (await fetch(`${BASE}/maps`)).json() as Array<{ id: string }>;
  assert(maps.length === 1, `maps count = 1 (got ${maps.length})`);

  const robotsAfterMap = await (await fetch(`${BASE}/robots`)).json() as Array<{ id: string }>;
  assert(robotsAfterMap.length === 2, "robots unaffected by map creation");

  // ---------- 7. Resource name validation ----------
  console.log("\n7. Resource name validation");

  const badName = await fetch(`${BASE}/bad%20name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 1 }),
  });
  record("reject invalid resource name (space)", badName.status === 400);

  // ---------- Summary ----------
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  - ${r.name}`);
    }
    process.exit(1);
  }

  console.log("\nAll tests passed!");
}

async function main() {
  console.log(`Starting server on port ${PORT} with data dir: ${DATA_DIR}`);
  const server = await startServer();

  try {
    await test();
  } finally {
    process.kill(server.pid);
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});