import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = parseInt(process.argv[2] ?? "30000", 10);
const BASE = `http://localhost:${PORT}/api/obs`;
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
    const proc = spawn(
      "npx",
      ["tsx", "server.ts", "--data-dir", DATA_DIR, "--port", String(PORT)],
      {
        cwd: import.meta.dirname,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

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

  // ---------- 1. PUT - Create JSON resources ----------
  console.log("1. PUT — Create JSON resources");

  const r1 = await fetch(`${BASE}/robots/robot-a`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-A", model: "X100" }),
  });
  record("PUT create JSON resource", r1.status === 200);
  const info1 = await r1.json();
  assert(info1.name === "robot-a", "resource name is robot-a");
  assert(info1.type === "file", "resource type is file");
  assert(
    info1.contentType === "application/json",
    "content type is application/json"
  );

  const r2 = await fetch(`${BASE}/robots/robot-b`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-B", model: "X200", firmware: "v1.0" }),
  });
  record("PUT create second JSON resource", r2.status === 200);
  const info2 = await r2.json();
  assert(info2.name === "robot-b", "resource name is robot-b");

  // ---------- 2. POST - Create with conflict check ----------
  console.log("\n2. POST — Create with conflict check");

  const r3 = await fetch(`${BASE}/robots/robot-c`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-C" }),
  });
  record("POST create new resource", r3.status === 201);
  const info3 = await r3.json();
  assert(info3.name === "robot-c", "POST resource name is robot-c");

  const r4 = await fetch(`${BASE}/robots/robot-a`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Robot-A-Duplicate" }),
  });
  record("POST existing resource returns 409", r4.status === 409);

  // ---------- 3. LIST - List directory contents ----------
  console.log("\n3. LIST — GET /api/obs/:resource");

  const listRes = await fetch(`${BASE}/robots`);
  record("list robots directory", listRes.status === 200);
  const list = (await listRes.json()) as Array<{
    name: string;
    type: string;
  }>;
  assert(Array.isArray(list), "list returns array");
  assert(list.length === 3, `list count = 3 (got ${list.length})`);
  const names = new Set(list.map((r) => r.name));
  assert(
    names.has("robot-a") && names.has("robot-b") && names.has("robot-c"),
    "list contains all created names"
  );

  // ---------- 4. GET - Get JSON resource ----------
  console.log("\n4. GET — Get JSON resource");

  const getRes = await fetch(`${BASE}/robots/robot-a`);
  record("get existing JSON resource", getRes.status === 200);
  assert(
    getRes.headers.get("content-type")?.includes("application/json") ?? false,
    "response content-type is application/json"
  );
  const getRobot = await getRes.json();
  assert(getRobot.name === "Robot-A", "get returns correct object");
  assert(getRobot.model === "X100", "get returns correct model");

  const notFound = await fetch(`${BASE}/robots/nonexistent`);
  record("get nonexistent returns 404", notFound.status === 404);

  // ---------- 5. PUT - Update existing resource ----------
  console.log("\n5. PUT — Update existing resource");

  const updateRes = await fetch(`${BASE}/robots/robot-a`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Robot-A-Pro",
      model: "X100",
      firmware: "v2.0",
    }),
  });
  record("update existing resource", updateRes.status === 200);
  const updated = await updateRes.json();
  assert(updated.name === "robot-a", "resource name preserved");
  assert(
    updated.contentType === "application/json",
    "content type preserved"
  );

  const verifyUpdate = await (
    await fetch(`${BASE}/robots/robot-a`)
  ).json();
  assert(verifyUpdate.name === "Robot-A-Pro", "updated content verified");
  assert(verifyUpdate.firmware === "v2.0", "new field verified");

  // ---------- 6. Binary file support ----------
  console.log("\n6. Binary file support");

  const binaryData = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);
  const binRes = await fetch(`${BASE}/robots/firmware`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: binaryData,
  });
  record("PUT binary resource", binRes.status === 200);
  const binInfo = await binRes.json();
  assert(
    binInfo.contentType === "application/octet-stream",
    "binary content type set"
  );
  assert(
    binInfo.size === binaryData.length,
    `binary size correct (${binInfo.size} vs ${binaryData.length})`
  );

  const getBin = await fetch(`${BASE}/robots/firmware`);
  record("GET binary resource", getBin.status === 200);
  assert(
    getBin.headers
      .get("content-type")
      ?.includes("application/octet-stream") ?? false,
    "binary response content-type"
  );
  const binContent = await getBin.arrayBuffer();
  assert(
    binContent.byteLength === binaryData.length,
    "binary content length matches"
  );

  // ---------- 7. MIME type inference with specific content type ----------
  console.log("\n7. MIME type inference");

  const pngRes = await fetch(`${BASE}/images/map-floor1`, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: binaryData,
  });
  record("PUT PNG resource", pngRes.status === 200);
  const pngInfo = await pngRes.json();
  assert(pngInfo.contentType === "image/png", "PNG content type set");

  const getPng = await fetch(`${BASE}/images/map-floor1`);
  assert(
    getPng.headers.get("content-type")?.includes("image/png") ?? false,
    "GET PNG returns image/png content-type"
  );

  const txtRes = await fetch(`${BASE}/logs/readme`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "Hello, world!",
  });
  record("PUT text resource", txtRes.status === 200);
  const txtInfo = await txtRes.json();
  assert(txtInfo.contentType === "text/plain", "text content type set");

  const getTxt = await fetch(`${BASE}/logs/readme`);
  assert(
    getTxt.headers.get("content-type")?.includes("text/plain") ?? false,
    "GET text returns text/plain content-type"
  );

  // ---------- 8. Content-Type change (extension update) ----------
  console.log("\n8. Content-Type change (extension update)");

  const changeRes = await fetch(`${BASE}/robots/robot-d`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ temp: true }),
  });
  record("PUT JSON resource for type change test", changeRes.status === 200);

  const changeRes2 = await fetch(`${BASE}/robots/robot-d`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "Now I am plain text",
  });
  record("PUT same path with different content type", changeRes2.status === 200);

  const getChanged = await fetch(`${BASE}/robots/robot-d`);
  assert(
    getChanged.headers.get("content-type")?.includes("text/plain") ?? false,
    "content type changed to text/plain"
  );

  // ---------- 9. Delete file resource ----------
  console.log("\n9. DELETE — Delete file resource");

  const delRes = await fetch(`${BASE}/robots/robot-b`, { method: "DELETE" });
  record("delete existing resource", delRes.status === 204);

  const delNotFound = await fetch(`${BASE}/robots/nonexistent`, {
    method: "DELETE",
  });
  record("delete nonexistent returns 404", delNotFound.status === 404);

  const listAfterDel = (await (
    await fetch(`${BASE}/robots`)
  ).json()) as Array<{ name: string }>;
  assert(
    listAfterDel.length === 4,
    `remaining count = 4 (got ${listAfterDel.length})`
  );

  // ---------- 10. Multi-level paths ----------
  console.log("\n10. Multi-level paths");

  const nested1 = await fetch(`${BASE}/fleet/alpha/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "auto", speed: 100 }),
  });
  record("PUT nested resource fleet/alpha/config", nested1.status === 200);

  const nested2 = await fetch(`${BASE}/fleet/alpha/sensors`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "LIDAR,CAMERA,IMU",
  });
  record("PUT nested resource fleet/alpha/sensors", nested2.status === 200);

  const nested3 = await fetch(`${BASE}/fleet/beta/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "manual", speed: 50 }),
  });
  record("PUT nested resource fleet/beta/config", nested3.status === 200);

  const listFleet = (await (
    await fetch(`${BASE}/fleet`)
  ).json()) as Array<{ name: string; type: string }>;
  assert(listFleet.length === 2, `fleet has 2 entries (got ${listFleet.length})`);
  const fleetNames = new Set(listFleet.map((r) => r.name));
  assert(
    fleetNames.has("alpha") && fleetNames.has("beta"),
    "fleet contains alpha and beta"
  );
  assert(
    listFleet.every((r) => r.type === "directory"),
    "alpha and beta are directories"
  );

  const listAlpha = (await (
    await fetch(`${BASE}/fleet/alpha`)
  ).json()) as Array<{ name: string; type: string }>;
  assert(
    listAlpha.length === 2,
    `alpha has 2 children (got ${listAlpha.length})`
  );
  const alphaNames = new Set(listAlpha.map((r) => r.name));
  assert(
    alphaNames.has("config") && alphaNames.has("sensors"),
    "alpha contains config and sensors"
  );

  const getConfig = await fetch(`${BASE}/fleet/alpha/config`);
  assert(getConfig.status === 200, "GET nested config");
  const configData = await getConfig.json();
  assert(configData.mode === "auto", "nested config content verified");

  const getLogs = await fetch(`${BASE}/fleet/alpha/sensors`);
  assert(getLogs.status === 200, "GET nested sensors");
  assert(
    getLogs.headers.get("content-type")?.includes("text/plain") ?? false,
    "nested sensors content-type"
  );

  // ---------- 11. Recursive directory delete ----------
  console.log("\n11. Recursive directory delete");

  const delDir = await fetch(`${BASE}/fleet/alpha`, { method: "DELETE" });
  record("delete directory recursively", delDir.status === 204);

  const verifyDirDeleted = await fetch(`${BASE}/fleet/alpha`);
  assert(verifyDirDeleted.status === 404, "directory deleted");

  const verifyConfigDeleted = await fetch(`${BASE}/fleet/alpha/config`);
  assert(verifyConfigDeleted.status === 404, "nested config also deleted");

  const verifySensorsDeleted = await fetch(`${BASE}/fleet/alpha/sensors`);
  assert(
    verifySensorsDeleted.status === 404,
    "nested sensors also deleted"
  );

  const verifyBeta = await fetch(`${BASE}/fleet/beta/config`);
  assert(verifyBeta.status === 200, "beta/config unaffected by alpha deletion");

  // ---------- 12. File/directory conflict prevention ----------
  console.log("\n12. File/directory conflict prevention");

  const conflictDirPut = await fetch(`${BASE}/fleet/beta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 1 }),
  });
  record(
    "PUT file where directory exists returns 400",
    conflictDirPut.status === 400
  );

  const conflictFileNested = await fetch(`${BASE}/robots/robot-a/nested`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 1 }),
  });
  record(
    "PUT nested where parent is file returns 400",
    conflictFileNested.status === 400
  );

  // ---------- 13. Root listing ----------
  console.log("\n13. Root listing");

  const rootList = await fetch(`${BASE}`);
  record("GET root listing", rootList.status === 200);
  const rootItems = (await rootList.json()) as Array<{
    name: string;
    type: string;
  }>;
  assert(Array.isArray(rootItems), "root returns array");
  assert(rootItems.length >= 2, `root has items (got ${rootItems.length})`);

  // ---------- 14. Cross-resource isolation ----------
  console.log("\n14. Cross-resource isolation");

  const imagesList = (await (
    await fetch(`${BASE}/images`)
  ).json()) as Array<{ name: string }>;
  assert(
    imagesList.length === 1,
    `images unaffected by robot operations (got ${imagesList.length})`
  );

  // ---------- 15. Resource name validation ----------
  console.log("\n15. Resource name validation");

  const badName = await fetch(`${BASE}/bad%20name/thing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 1 }),
  });
  record("reject invalid resource name (space)", badName.status === 400);

  const badDotDot = await fetch(`${BASE}/..%2Fetc/passwd`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 1 }),
  });
  record("reject path traversal (..)", badDotDot.status === 400);

  // ---------- Summary ----------
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  - ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
    process.exit(1);
  }

  console.log("\nAll tests passed!");
}

async function main() {
  console.log(
    `Starting server on port ${PORT} with data dir: ${DATA_DIR}`
  );
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
