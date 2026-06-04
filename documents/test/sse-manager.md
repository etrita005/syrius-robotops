# Unified SSE Manager Test Case Design Document

> This document is based on `documents/requirements/sse-manager.md` and `documents/design/sse-manager.md`, covering all functional and non-functional requirements for the Unified SSE Manager module.

---

## 1. Test Strategy

### 1.1 Test Scope

- **Unit Tests**: `UnifiedSseManager` core class methods (`addClient`, `removeClient`, `broadcast`, `getClientCount`)
- **Integration Tests**: Module integration with `TaskFlowEngine` and `RobotCacheEventHandler`
- **HTTP Route Tests**: Unified SSE endpoint (`GET /api/sse`) behavior
- **Protocol Tests**: SSE protocol output format verification
- **Error Handling Tests**: Client disconnection, write failures, zombie connection cleanup

### 1.2 Test Framework

- Use Node.js built-in `node:test` + `node:assert` (consistent with existing project test suite in `src/backend/src/test.ts`).
- Mock `ReadableStreamDefaultController` for unit testing without real HTTP connections.

### 1.3 Mock Strategies

- **ReadableStreamDefaultController**: Mock object with `enqueue(bytes)` method and a flag to simulate write failures.
- **ObjectStore**: Use existing in-memory implementation.
- **TaskFlowEngine**: Use real engine with mock resolvers.
- **MemStore**: Use real `MemStore` with a `RobotCacheEventHandler` that uses the Unified SSE Manager.

---

## 2. Unit Tests

### TC-SSE-001: addClient registers a new client

| Item | Value |
|------|-------|
| **Test Target** | Verify `addClient()` adds a client to the registry |
| **Precondition** | Fresh `UnifiedSseManager` instance |
| **Input** | `addClient({ id: "client-1", controller: mockController })` |
| **Expected Result** | `getClientCount()` returns `1` |
| **Verification Point** | Client exists in internal registry |

### TC-SSE-002: removeClient unregisters a client by ID

| Item | Value |
|------|-------|
| **Test Target** | Verify `removeClient()` removes a client |
| **Precondition** | Client "client-1" is registered |
| **Input** | `removeClient("client-1")` |
| **Expected Result** | `getClientCount()` returns `0` |
| **Verification Point** | Client no longer in registry |

### TC-SSE-003: removeClient is idempotent for non-existent ID

| Item | Value |
|------|-------|
| **Test Target** | Verify `removeClient()` does not throw for unknown ID |
| **Precondition** | Empty registry |
| **Input** | `removeClient("non-existent")` |
| **Expected Result** | No exception thrown, `getClientCount()` returns `0` |
| **Verification Point** | No crash, registry remains empty |

### TC-SSE-004: broadcast sends event to all connected clients

| Item | Value |
|------|-------|
| **Test Target** | Verify `broadcast()` delivers events to all clients |
| **Precondition** | 2 mock clients registered |
| **Input** | `broadcast("test/event", { foo: "bar" })` |
| **Expected Result** | Both mock controllers receive exactly one `enqueue()` call with valid SSE protocol bytes |
| **Verification Point** | Each controller's `enqueue` call count == 1 |

### TC-SSE-005: broadcast includes timestamp in envelope

| Item | Value |
|------|-------|
| **Test Target** | Verify envelope contains ISO 8601 timestamp |
| **Precondition** | 1 mock client registered |
| **Input** | `broadcast("test/event", { foo: "bar" })` |
| **Expected Result** | Enqueued data contains `"timestamp"` field matching ISO 8601 regex |
| **Verification Point** | Parse JSON payload, assert `timestamp` is valid ISO string close to `Date.now()` |

### TC-SSE-006: broadcast uses correct SSE protocol format

| Item | Value |
|------|-------|
| **Test Target** | Verify output matches SSE protocol spec |
| **Precondition** | 1 mock client registered |
| **Input** | `broadcast("test/event", { foo: "bar" })` |
| **Expected Result** | Enqueued string matches pattern: `event: test/event\ndata: {"event":"test/event",...}\n\n` |
| **Verification Point** | Decode bytes to string, assert regex match |

### TC-SSE-007: broadcast removes client on write failure and continues

| Item | Value |
|------|-------|
| **Test Target** | Verify failed writes are handled gracefully (FR-SSE-008, NFR-SSE-003) |
| **Precondition** | 2 clients: client-A (normal), client-B (throws on enqueue) |
| **Input** | `broadcast("test/event", { foo: "bar" })` |
| **Expected Result** | client-A receives the event; client-B is removed from registry; `getClientCount()` returns `1` |
| **Verification Point** | No exception thrown from `broadcast()`; registry cleaned up |

### TC-SSE-008: broadcast with empty event name throws

| Item | Value |
|------|-------|
| **Test Target** | Verify validation of event name |
| **Precondition** | 1 client registered |
| **Input** | `broadcast("", { foo: "bar" })` |
| **Expected Result** | Throws `Error` with message indicating empty event name |
| **Verification Point** | Exception thrown, no client receives data |

### TC-SSE-009: broadcast with non-serializable payload is handled

| Item | Value |
|------|-------|
| **Test Target** | Verify resilience against JSON serialization failures |
| **Precondition** | 1 client registered |
| **Input** | `broadcast("test/event", { foo: BigInt(123) })` (or circular reference) |
| **Expected Result** | `broadcast()` catches the error internally; no exception propagated; client receives no data for this event |
| **Verification Point** | No crash, client `enqueue` not called |

### TC-SSE-010: getClientCount reflects accurate state

| Item | Value |
|------|-------|
| **Test Target** | Verify `getClientCount()` accuracy |
| **Precondition** | Fresh instance |
| **Operation** | Add 3 clients, remove 1, broadcast (causing 1 failure auto-removal) |
| **Expected Result** | Counts are 0 -> 3 -> 2 -> 1 at each stage |
| **Verification Point** | Assert count after each operation |

---

## 3. Integration Tests

### TC-SSE-011: TaskFlowEngine emits flow-created event via Unified SSE Manager

| Item | Value |
|------|-------|
| **Test Target** | Verify TaskFlowEngine integration with Unified SSE Manager (FR-SSE-005) |
| **Precondition** | Engine initialized with mock resolvers, 1 mock SSE client registered |
| **Input** | `engine.createFlow("internal", dag)` |
| **Expected Result** | Mock client receives `event: task-flow-engine/flow-created` with `FlowSummary` payload and timestamp |
| **Verification Point** | Parse envelope, assert `event === "task-flow-engine/flow-created"`, payload contains `id`, `state` |

### TC-SSE-012: TaskFlowEngine emits flow-completed event

| Item | Value |
|------|-------|
| **Test Target** | Verify flow terminal state event |
| **Precondition** | Engine with single-task DAG, 1 mock client |
| **Input** | Create and wait for flow completion |
| **Expected Result** | Client receives `task-flow-engine/flow-completed` event with `flowId`, `state`, `results`, `finishedAt` |
| **Verification Point** | Envelope payload matches expected shape |

### TC-SSE-013: TaskFlowEngine emits task-updated and task-result events

| Item | Value |
|------|-------|
| **Test Target** | Verify task lifecycle events |
| **Precondition** | Engine with single-task DAG, 1 mock client |
| **Input** | Create flow and wait for task completion |
| **Expected Result** | Client receives `task-updated` (RUNNING), `task-updated` (COMPLETED), and `task-result` events in sequence |
| **Verification Point** | Event order and payload shapes are correct |

### TC-SSE-014: RobotCacheEventHandler emits entry-updated event

| Item | Value |
|------|-------|
| **Test Target** | Verify MemStore integration with Unified SSE Manager (FR-SSE-005) |
| **Precondition** | `RobotService` initialized with `UnifiedSseManager`, 1 mock client, cache created |
| **Input** | `memStore.updateCache("robot:sol1/rob1", { name: "Robot A" })` |
| **Expected Result** | Client receives `event: memstore/entry-updated` with `key`, `value`, `properties` |
| **Verification Point** | Payload contains correct key and value |

### TC-SSE-015: RobotCacheEventHandler emits entry-deleted event

| Item | Value |
|------|-------|
| **Test Target** | Verify cache deletion event |
| **Precondition** | Cache exists for key "robot:sol1/rob1" |
| **Input** | `memStore.deleteCache("robot:sol1/rob1")` |
| **Expected Result** | Client receives `event: memstore/entry-deleted` with `{ key: "robot:sol1/rob1" }` |
| **Verification Point** | Payload key matches deleted key |

### TC-SSE-016: Multiple modules broadcast independently

| Item | Value |
|------|-------|
| **Test Target** | Verify events from different modules coexist on the same channel (FR-SSE-002) |
| **Precondition** | TaskFlowEngine and RobotService share one `UnifiedSseManager`, 1 mock client |
| **Input** | Trigger both a cache update and a flow creation |
| **Expected Result** | Client receives two distinct events: `memstore/entry-updated` and `task-flow-engine/flow-created` |
| **Verification Point** | Both events parsed correctly, namespaces differ |

---

## 4. HTTP Route Tests

### TC-SSE-017: GET /api/sse returns text/event-stream

| Item | Value |
|------|-------|
| **Test Target** | Verify unified endpoint headers (FR-SSE-007) |
| **Precondition** | Backend running |
| **Input** | `GET /api/sse` |
| **Expected Result** | HTTP 200, `Content-Type: text/event-stream`, `Cache-Control: no-cache` |
| **Verification Point** | Response headers correct |

### TC-SSE-018: GET /api/sse sends connected event

| Item | Value |
|------|-------|
| **Test Target** | Verify connection acknowledgment |
| **Precondition** | Backend running |
| **Input** | `GET /api/sse` |
| **Expected Result** | First SSE event is `event: connected` with JSON payload containing `clientId` |
| **Verification Point** | Parse SSE stream, assert first event name and payload shape |

### TC-SSE-019: GET /api/sse pushes current MemStore state on connect

| Item | Value |
|------|-------|
| **Test Target** | Verify initial state push (FR-SSE-010) |
| **Precondition** | MemStore contains 2 entries with values |
| **Input** | `GET /api/sse` |
| **Expected Result** | After `connected`, client receives `memstore/entry-current` events for both entries |
| **Verification Point** | Exactly 2 `memstore/entry-current` events before any heartbeat |

### TC-SSE-020: GET /api/sse sends periodic ping

| Item | Value |
|------|-------|
| **Test Target** | Verify heartbeat (FR-SSE-009) |
| **Precondition** | Backend running with short ping interval (e.g., 100ms for testing) |
| **Input** | `GET /api/sse`, wait 250ms |
| **Expected Result** | At least 2 `event: ping` events received |
| **Verification Point** | Ping events contain `{ type: "ping" }` |

### TC-SSE-021: Client disconnection removes client from SSE Manager

| Item | Value |
|------|-------|
| **Test Target** | Verify cleanup on disconnect (FR-SSE-008) |
| **Precondition** | Client connected, SSE Manager shows 1 client |
| **Input** | Client aborts connection |
| **Expected Result** | After abort, `sseManager.getClientCount()` returns `0` |
| **Verification Point** | Registry cleaned up |

---

## 5. Legacy Compatibility and Migration Tests

### TC-SSE-022: Existing TaskFlowEngine tests pass with Unified SSE Manager

| Item | Value |
|------|-------|
| **Test Target** | Verify backward compatibility of TaskFlowEngine after migration (FR-SSE-011) |
| **Precondition** | All existing TaskFlowEngine test cases |
| **Input** | Run existing test suite with `UnifiedSseManager` injected instead of legacy `SseManager` |
| **Expected Result** | All existing tests pass without modification (except mock type casts) |
| **Verification Point** | Zero regressions in task flow functionality |

### TC-SSE-023: Existing RobotService tests pass with Unified SSE Manager

| Item | Value |
|------|-------|
| **Test Target** | Verify backward compatibility of RobotService after migration |
| **Precondition** | All existing RobotService / MemStore SSE test cases |
| **Input** | Run existing test suite with `UnifiedSseManager` |
| **Expected Result** | All existing tests pass (noting that `subscribe` immediate-push behavior moves to route layer) |
| **Verification Point** | Cache events still emitted, broadcast still functional |

---

## 6. Error Handling Tests

### TC-SSE-024: Single client failure does not affect others during broadcast

| Item | Value |
|------|-------|
| **Test Target** | Verify isolation between clients (NFR-SSE-003) |
| **Precondition** | 3 clients: A (normal), B (fails once then recovers), C (normal) |
| **Input** | `broadcast("test", {})` |
| **Expected Result** | A and C receive the event; B is removed; no exception |
| **Verification Point** | A and C enqueue called, B removed |

### TC-SSE-025: broadcast never throws

| Item | Value |
|------|-------|
| **Test Target** | Verify broadcast resilience (NFR-SSE-003) |
| **Precondition** | All clients configured to throw on every `enqueue` |
| **Input** | `broadcast("test", {})` |
| **Expected Result** | `broadcast()` returns normally, all clients removed, no exception thrown |
| **Verification Point** | No unhandled exception |

### TC-SSE-026: Empty event name validation

| Item | Value |
|------|-------|
| **Test Target** | Verify input validation |
| **Precondition** | 1 client registered |
| **Input** | `broadcast("", {})` |
| **Expected Result** | Throws descriptive error |
| **Verification Point** | Exception message contains "event name" |

---

## 7. Performance and Load Tests

### TC-SSE-027: Broadcast with 100 clients

| Item | Value |
|------|-------|
| **Test Target** | Verify performance under load (NFR-SSE-001) |
| **Precondition** | 100 mock clients registered |
| **Input** | `broadcast("test", { data: "x".repeat(1000) })` |
| **Expected Result** | Broadcast completes in < 10ms; all 100 clients receive the event |
| **Verification Point** | Timing assertion, all clients have enqueue count == 1 |

### TC-SSE-028: Rapid add/remove cycle

| Item | Value |
|------|-------|
| **Test Target** | Verify registry stability under churn |
| **Precondition** | Fresh manager |
| **Input** | Add 50 clients, remove 25, add 25, remove all — repeated 10 times |
| **Expected Result** | `getClientCount()` is accurate at each step; no memory leak symptoms |
| **Verification Point** | Final count is 0 |

---

## 8. Test Coverage Goals

| Coverage Type | Target |
|---------------|--------|
| Function coverage | >= 95% |
| Branch coverage | >= 90% |
| Line coverage | >= 95% |

| Module | Target Coverage |
|--------|-----------------|
| `services/sseManager.ts` (UnifiedSseManager) | 100% function coverage |
| `services/taskFlowEngine/taskFlowEngine.ts` (emit wrappers) | 100% of new emit methods |
| `services/robotService.ts` (RobotCacheEventHandler emit wrappers) | 100% of new emit methods |
| `index.ts` (unified SSE route) | >= 80% route coverage |

---

## 9. Test Data Definitions

### 9.1 Mock ReadableStreamDefaultController

```typescript
function createMockController(options?: { failAfter?: number }): ReadableStreamDefaultController & { enqueued: Uint8Array[]; failCount: number } {
  const enqueued: Uint8Array[] = [];
  let failCount = 0;
  return {
    enqueued,
    failCount,
    enqueue(chunk: Uint8Array) {
      if (options?.failAfter !== undefined && enqueued.length >= options.failAfter) {
        failCount++;
        throw new Error("Simulated write failure");
      }
      enqueued.push(chunk);
    },
  } as unknown as ReadableStreamDefaultController & { enqueued: Uint8Array[]; failCount: number };
}
```

### 9.2 SSE Protocol Parser (for test assertions)

```typescript
function parseSseEvents(bytes: Uint8Array): Array<{ event: string; data: unknown }> {
  const text = new TextDecoder().decode(bytes);
  const events: Array<{ event: string; data: unknown }> = [];
  // Parse "event: xxx\ndata: yyy\n\n" blocks
  const blocks = text.split("\n\n").filter((b) => b.trim());
  for (const block of blocks) {
    const eventMatch = block.match(/event: (.+)/);
    const dataMatch = block.match(/data: (.+)/);
    if (eventMatch && dataMatch) {
      events.push({
        event: eventMatch[1],
        data: JSON.parse(dataMatch[1]),
      });
    }
  }
  return events;
}
```

### 9.3 Test DAG Template (for TaskFlowEngine integration)

Reuse existing test DAGs from `documents/test/task_flow_engine_test_cases.md` Section 7.2.

### 9.4 MemStore Test Setup (for RobotCacheEventHandler integration)

```typescript
const sseManager = new UnifiedSseManager();
const memStore = new MemStore();
const robotService = new RobotService(
  objectStore,
  taskFlowEngine,
  sseManager,  // Unified SSE Manager
  memStore,
  { sshUsername: "root", sshPassword: "" }
);
```

---

## 10. Test Execution

```bash
cd src/backend
npm install
npx vitest run --reporter=verbose
```

All new test cases are added to the existing `src/backend/src/test.ts` file, following the existing test organization patterns.
