import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as objectStore from "./objectStore/store.js";
import { createObjectStoreApp } from "./objectStore/server.js";
import { ObjectStoreClient } from "./services/objectStoreClient.js";
import { ChecksumService } from "./services/checksumService.js";
import { ArtifactService } from "./services/artifactService.js";
import { SolutionService } from "./services/solutionService.js";
import { createSolutionRoutes } from "./routes/solutionRoutes.js";
import { createArtifactRoutes } from "./routes/artifactRoutes.js";

const OBS_PORT = 30998;
const API_PORT = 30999;
const OBS_BASE_URL = `http://localhost:${OBS_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;

let apiServer: ReturnType<typeof serve> | null = null;
let obsServer: ReturnType<typeof serve> | null = null;

async function startObjectStore(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "robotops-test-obs-"));
  objectStore.configure(dataDir);

  const obsApp = createObjectStoreApp();

  obsServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve({ fetch: obsApp.fetch, port: OBS_PORT }, () => resolve(s));
  });
}

async function startApiServer(): Promise<void> {
  const obsClient = new ObjectStoreClient({ baseUrl: OBS_BASE_URL });
  const checksumService = new ChecksumService();
  const artifactService = new ArtifactService(obsClient, checksumService);
  const solutionService = new SolutionService(obsClient, artifactService);

  const app = new Hono();
  app.route("/api/solutions", createSolutionRoutes(solutionService));
  app.route("/api/artifacts", createArtifactRoutes(artifactService));

  apiServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve({ fetch: app.fetch, port: API_PORT }, () => {
      apiServer = s;
      resolve(s);
    });
  });
}

async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const url = `${API_BASE_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  const response = await fetch(url, init);
  if (response.status === 204) return { status: response.status, data: null };
  const text = await response.text().catch(() => "");
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON response
  }
  return { status: response.status, data };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
  }
}

async function createTestFile(content: Buffer, name: string): Promise<string> {
  const { writeFile } = await import("node:fs/promises");
  const tmpDir = mkdtempSync(join(tmpdir(), "robotops-test-"));
  const testFile = join(tmpDir, name);
  await writeFile(testFile, content);
  return testFile;
}

async function runTests(): Promise<void> {
  console.log("\n=== Solution Management Module Tests ===\n");

  console.log("--- TC-SOL-001: Create Solution (valid input) ---");
  {
    const { status, data } = await apiRequest("POST", "/api/solutions", {
      name: "Test Solution Alpha",
      description: "A test solution",
      tags: ["test", "alpha"],
    });
    assert(status === 201, `TC-SOL-001: Expected 201, got ${status}`);
    const meta = data as Record<string, unknown>;
    assert(typeof meta.id === "string" && meta.id.length > 0, "TC-SOL-001: Should return valid ID");
    assert(meta.name === "Test Solution Alpha", "TC-SOL-001: Should return correct name");
    assert(meta.version === "1.0.0", "TC-SOL-001: Should initialize version to 1.0.0");
    assert(Array.isArray(meta.tags) && meta.tags.includes("test"), "TC-SOL-001: Should include tags");
  }

  console.log("--- TC-SOL-002: Create Solution (missing name) ---");
  {
    const { status } = await apiRequest("POST", "/api/solutions", {
      description: "No name",
    });
    assert(status === 400, `TC-SOL-002: Expected 400, got ${status}`);
  }

  console.log("--- TC-SOL-003: Create Solution (duplicate ID) ---");
  {
    const { status: s1 } = await apiRequest("POST", "/api/solutions", {
      id: "dup-test-id",
      name: "First",
    });
    assert(s1 === 201, `TC-SOL-003a: Expected 201, got ${s1}`);
    const { status: s2 } = await apiRequest("POST", "/api/solutions", {
      id: "dup-test-id",
      name: "Second",
    });
    assert(s2 === 409, `TC-SOL-003b: Expected 409 for duplicate ID, got ${s2}`);
  }

  console.log("--- TC-SOL-004: Create Solution (invalid ID format) ---");
  {
    const { status } = await apiRequest("POST", "/api/solutions", {
      id: "invalid id!",
      name: "Bad ID",
    });
    assert(status === 400, `TC-SOL-004: Expected 400, got ${status}`);
  }

  console.log("--- TC-SOL-005: List Solutions ---");
  {
    const { status, data } = await apiRequest("GET", "/api/solutions");
    assert(status === 200, `TC-SOL-005: Expected 200, got ${status}`);
    const result = data as { items: unknown[]; corruptedIds: unknown[] };
    assert(Array.isArray(result.items), "TC-SOL-005: Should return items array");
    assert(result.items.length >= 2, `TC-SOL-005: Should have at least 2 solutions, got ${result.items.length}`);
  }

  console.log("--- TC-SOL-006: List Solutions (filter by name) ---");
  {
    const { status, data } = await apiRequest("GET", "/api/solutions?filter[name]=Alpha");
    assert(status === 200, `TC-SOL-006: Expected 200, got ${status}`);
    const result = data as { items: { name: string }[] };
    assert(result.items.length >= 1, "TC-SOL-006: Should have at least 1 matching solution");
    assert(result.items.every((i) => i.name.includes("Alpha")), "TC-SOL-006: All items should match filter");
  }

  console.log("--- TC-SOL-007: Get Solution ---");
  {
    const { data: createData } = await apiRequest("POST", "/api/solutions", {
      name: "Get Test Solution",
    });
    const id = (createData as Record<string, unknown>).id;
    const { status, data } = await apiRequest("GET", `/api/solutions/${id}`);
    assert(status === 200, `TC-SOL-007: Expected 200, got ${status}`);
    assert((data as Record<string, unknown>).name === "Get Test Solution", "TC-SOL-007: Should return correct solution");
  }

  console.log("--- TC-SOL-008: Get Solution (not found) ---");
  {
    const { status } = await apiRequest("GET", "/api/solutions/nonexistent-id-xyz");
    assert(status === 404, `TC-SOL-008: Expected 404, got ${status}`);
  }

  console.log("--- TC-SOL-009: Update Solution ---");
  {
    const { data: createData } = await apiRequest("POST", "/api/solutions", {
      name: "Before Update",
    });
    const id = (createData as Record<string, unknown>).id;
    const { status, data } = await apiRequest("PUT", `/api/solutions/${id}`, {
      name: "After Update",
      description: "Updated description",
    });
    assert(status === 200, `TC-SOL-009: Expected 200, got ${status}`);
    const meta = data as Record<string, unknown>;
    assert(meta.name === "After Update", "TC-SOL-009: Name should be updated");
    assert(meta.version === "1.0.1", `TC-SOL-009: Version should bump to 1.0.1, got ${meta.version}`);
  }

  console.log("--- TC-SOL-010: Update Solution (immutable fields) ---");
  {
    const { data: createData } = await apiRequest("POST", "/api/solutions", {
      name: "Immutable Test",
    });
    const id = (createData as Record<string, unknown>).id;
    const originalCreatedAt = (createData as Record<string, unknown>).createdAt;
    const { data } = await apiRequest("PUT", `/api/solutions/${id}`, {
      name: "Immutable Test Updated",
    });
    const meta = data as Record<string, unknown>;
    assert(meta.id === id, "TC-SOL-010: ID should not change");
    assert(meta.createdAt === originalCreatedAt, "TC-SOL-010: createdAt should not change");
  }

  console.log("--- TC-SOL-011: Delete Solution ---");
  {
    const { data: createData } = await apiRequest("POST", "/api/solutions", {
      name: "To Be Deleted",
    });
    const id = (createData as Record<string, unknown>).id;
    const { status } = await apiRequest("DELETE", `/api/solutions/${id}`);
    assert(status === 204, `TC-SOL-011: Expected 204, got ${status}`);
    const { status: getStatus } = await apiRequest("GET", `/api/solutions/${id}`);
    assert(getStatus === 404, "TC-SOL-011: Solution should be gone after delete");
  }

  console.log("--- TC-SOL-012: Delete Solution (not found) ---");
  {
    const { status } = await apiRequest("DELETE", "/api/solutions/nonexistent-delete-id");
    assert(status === 404, `TC-SOL-012: Expected 404, got ${status}`);
  }

  console.log("--- TC-SOL-013: Clone Solution ---");
  {
    const { data: createData } = await apiRequest("POST", "/api/solutions", {
      name: "Clone Source",
      description: "Original description",
      tags: ["clone-src"],
    });
    const sourceId = (createData as Record<string, unknown>).id;
    const { status, data } = await apiRequest("POST", `/api/solutions/${sourceId}/clone`, {
      name: "Cloned Solution",
    });
    assert(status === 201, `TC-SOL-013: Expected 201, got ${status}`);
    const meta = data as Record<string, unknown>;
    assert(meta.name === "Cloned Solution", "TC-SOL-013: Should have new name");
    assert(meta.id !== sourceId, "TC-SOL-013: Should have different ID");
    assert(meta.version === "1.0.0", "TC-SOL-013: Version should be reset to 1.0.0");
  }

  console.log("--- TC-SOL-014: Version auto-increment on multiple updates ---");
  {
    const { data: createData } = await apiRequest("POST", "/api/solutions", {
      name: "Version Test",
    });
    const id = (createData as Record<string, unknown>).id;
    await apiRequest("PUT", `/api/solutions/${id}`, { name: "Version Test v2" });
    await apiRequest("PUT", `/api/solutions/${id}`, { name: "Version Test v3" });
    await apiRequest("PUT", `/api/solutions/${id}`, { name: "Version Test v4" });
    const { data } = await apiRequest("GET", `/api/solutions/${id}`);
    const meta = data as Record<string, unknown>;
    assert(meta.version === "1.0.3", `TC-SOL-014: Expected version 1.0.3, got ${meta.version}`);
  }

  console.log("\n=== Artifact Management Module Tests ===\n");

  console.log("--- TC-ART-001: Upload Artifact (new file) ---");
  {
    const testFile = await createTestFile(Buffer.alloc(1024, 0xAB), "firmware_v1.fw");
    const { status, data } = await apiRequest("POST", "/api/artifacts/upload", {
      filePath: testFile,
      tags: ["firmware", "test"],
    });
    assert(status === 201, `TC-ART-001: Expected 201, got ${status}`);
    const result = data as Record<string, unknown>;
    assert(result.status === "success", `TC-ART-001: Expected status 'success', got '${result.status}'`);
    const artifact = result.artifact as Record<string, unknown>;
    assert(artifact.fileName === "firmware_v1.fw", "TC-ART-001: Should have correct fileName");
    assert(artifact.refCount === 0, "TC-ART-001: refCount should be 0");
    assert(typeof artifact.checksum === "string" && artifact.checksum.length === 64, "TC-ART-001: Should have valid SHA-256 checksum");
  }

  console.log("--- TC-ART-002: Upload Artifact (deduplication) ---");
  {
    const content = Buffer.alloc(512, 0xCD);
    const file1 = await createTestFile(content, "same_content_a.bin");
    const file2 = await createTestFile(content, "same_content_b.bin");

    await apiRequest("POST", "/api/artifacts/upload", { filePath: file1 });
    const { data } = await apiRequest("POST", "/api/artifacts/upload", { filePath: file2 });
    const result = data as Record<string, unknown>;
    assert(result.status === "deduplicated", `TC-ART-002: Expected status 'deduplicated', got '${result.status}'`);
  }

  console.log("--- TC-ART-003: List Artifacts ---");
  {
    const { status, data } = await apiRequest("GET", "/api/artifacts");
    assert(status === 200, `TC-ART-003: Expected 200, got ${status}`);
    const result = data as { items: unknown[]; total: number };
    assert(Array.isArray(result.items), "TC-ART-003: Should return items array");
    assert(result.total >= 1, "TC-ART-003: Should have at least 1 artifact");
  }

  console.log("--- TC-ART-004: Get Artifact ---");
  {
    const { data: listData } = await apiRequest("GET", "/api/artifacts");
    const items = (listData as { items: { id: string }[] }).items;
    if (items.length > 0) {
      const { status, data } = await apiRequest("GET", `/api/artifacts/${items[0].id}`);
      assert(status === 200, `TC-ART-004: Expected 200, got ${status}`);
      const meta = data as Record<string, unknown>;
      assert(typeof meta.id === "string", "TC-ART-004: Should return artifact with ID");
    } else {
      assert(false, "TC-ART-004: No artifacts available to test");
    }
  }

  console.log("--- TC-ART-005: Get Artifact (not found) ---");
  {
    const { status } = await apiRequest("GET", "/api/artifacts/nonexistent-artifact");
    assert(status === 404, `TC-ART-005: Expected 404, got ${status}`);
  }

  console.log("--- TC-ART-006: Update Artifact metadata ---");
  {
    const testFile = await createTestFile(Buffer.alloc(256, 0xEF), "updatable.fw");
    const { data } = await apiRequest("POST", "/api/artifacts/upload", {
      filePath: testFile,
      tags: ["before-update"],
    });
    const artifactId = ((data as Record<string, unknown>).artifact as Record<string, unknown>).id as string;

    const { status, data: updateData } = await apiRequest("PUT", `/api/artifacts/${artifactId}`, {
      tags: ["after-update"],
      metadata: { version: "2.0" },
    });
    assert(status === 200, `TC-ART-006: Expected 200, got ${status}`);
    const meta = updateData as Record<string, unknown>;
    assert(Array.isArray(meta.tags) && meta.tags.includes("after-update"), "TC-ART-006: Tags should be updated");
  }

  console.log("--- TC-ART-007: Delete Artifact (refCount = 0) ---");
  {
    const testFile = await createTestFile(Buffer.alloc(128, 0x11), "deletable.bin");
    const { data } = await apiRequest("POST", "/api/artifacts/upload", { filePath: testFile });
    const artifactId = ((data as Record<string, unknown>).artifact as Record<string, unknown>).id as string;

    const { status } = await apiRequest("DELETE", `/api/artifacts/${artifactId}`);
    assert(status === 204, `TC-ART-007: Expected 204, got ${status}`);

    const { status: getStatus } = await apiRequest("GET", `/api/artifacts/${artifactId}`);
    assert(getStatus === 404, "TC-ART-007: Artifact should be gone after delete");
  }

  console.log("--- TC-ART-008: Delete Artifact (refCount > 0, should fail) ---");
  {
    const testFile = await createTestFile(Buffer.alloc(64, 0x22), "referenced.bin");
    const { data } = await apiRequest("POST", "/api/artifacts/upload", { filePath: testFile });
    const artifactId = ((data as Record<string, unknown>).artifact as Record<string, unknown>).id as string;

    await apiRequest("POST", `/api/artifacts/${artifactId}/increment-ref`);
    const { status } = await apiRequest("DELETE", `/api/artifacts/${artifactId}`);
    assert(status === 409, `TC-ART-008: Expected 409 (referenced), got ${status}`);

    await apiRequest("POST", `/api/artifacts/${artifactId}/decrement-ref`);
    const { status: deleteStatus } = await apiRequest("DELETE", `/api/artifacts/${artifactId}`);
    assert(deleteStatus === 204, `TC-ART-008b: Expected 204 after decrement, got ${deleteStatus}`);
  }

  console.log("--- TC-ART-009: Increment/Decrement Ref Count ---");
  {
    const testFile = await createTestFile(Buffer.alloc(32, 0x33), "refcount_test.bin");
    const { data } = await apiRequest("POST", "/api/artifacts/upload", { filePath: testFile });
    const artifactId = ((data as Record<string, unknown>).artifact as Record<string, unknown>).id as string;

    await apiRequest("POST", `/api/artifacts/${artifactId}/increment-ref`);
    const { data: afterInc } = await apiRequest("GET", `/api/artifacts/${artifactId}`);
    assert((afterInc as Record<string, unknown>).refCount === 1, "TC-ART-009: refCount should be 1 after increment");

    await apiRequest("POST", `/api/artifacts/${artifactId}/increment-ref`);
    const { data: afterInc2 } = await apiRequest("GET", `/api/artifacts/${artifactId}`);
    assert((afterInc2 as Record<string, unknown>).refCount === 2, "TC-ART-009: refCount should be 2 after second increment");

    await apiRequest("POST", `/api/artifacts/${artifactId}/decrement-ref`);
    const { data: afterDec } = await apiRequest("GET", `/api/artifacts/${artifactId}`);
    assert((afterDec as Record<string, unknown>).refCount === 1, "TC-ART-009: refCount should be 1 after decrement");
  }

  console.log("--- TC-ART-010: Delete Artifact (invalid ID) ---");
  {
    const { status } = await apiRequest("DELETE", "/api/artifacts/invalid%20id!");
    assert(status === 400, `TC-ART-010: Expected 400, got ${status}`);
  }

  console.log("--- TC-ART-011: Ref Count Audit ---");
  {
    const { status, data } = await apiRequest("POST", "/api/artifacts/audit/ref-count");
    assert(status === 200, `TC-ART-011: Expected 200, got ${status}`);
    const result = data as { corrected: number; inconsistencies: number };
    assert(typeof result.corrected === "number", "TC-ART-011: Should return corrected count");
    assert(typeof result.inconsistencies === "number", "TC-ART-011: Should return inconsistencies count");
  }

  console.log("\n========================================");
  console.log(`  Test Results: ${passed} passed, ${failed} failed`);
  console.log("========================================");

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
}

async function main(): Promise<void> {
  try {
    console.log("Starting Object Store...");
    await startObjectStore();
    console.log("Object Store started.");

    console.log("Starting API server...");
    await startApiServer();
    console.log("API server started.");

    await new Promise((resolve) => setTimeout(resolve, 500));

    await runTests();
  } catch (err) {
    console.error("Test runner error:", err);
  } finally {
    if (apiServer) {
      apiServer.close();
    }
    if (obsServer) {
      obsServer.close();
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
