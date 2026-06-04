# Unified SSE Manager Module Requirements

## 1. Background and Objectives

### 1.1 Current Status

The backend currently maintains two independent SSE (Server-Sent Events) managers:

- `MemStoreSseManager` (`src/backend/src/memStore/sseManager.ts`): Manages in-memory callback-based subscriptions for MemStore cache updates. Exposed via `/api/sse?key=` endpoint.
- `SseManager` (`src/backend/src/services/taskFlowEngine/sseManager.ts`): Manages HTTP SSE client connections (`ReadableStreamDefaultController`) for TaskFlowEngine events. Exposed via `/api/flows/events` endpoint.

The frontend must maintain two separate `EventSource` connections, and the event formats are inconsistent.

### 1.2 Objective

Design and implement a **Unified SSE Manager** as the sole backend-to-frontend notification channel. All modules broadcast events through this single manager. Event differentiation is achieved via structured event names (namespaces).

### 1.3 Scope

This requirement covers:
- The Unified SSE Manager module itself
- Integration with MemStore / RobotService (cache events)
- Integration with TaskFlowEngine (flow lifecycle events)
- Unified HTTP SSE endpoint design
- Message envelope standardization

This requirement does **not** cover frontend consumption logic, which remains the responsibility of the frontend application.

---

## 2. Functional Requirements

### FR-SSE-001: Unified SSE Manager as Sole Notification Channel

- The Unified SSE Manager must be the **only** component responsible for managing HTTP SSE connections to the frontend.
- All backend modules that need to push real-time events to the frontend must do so through the Unified SSE Manager instance.
- No module is permitted to directly manipulate `ReadableStreamDefaultController` or raw HTTP response streams for event推送 purposes.

### FR-SSE-002: Event Namespace Isolation

- Events must be differentiated by structured event names (namespaces), not by separate endpoints or managers.
- Event names must follow the pattern: `<module>/<event-type>`.
- Examples:
  - `memstore/entry-updated`
  - `memstore/entry-deleted`
  - `memstore/entry-current`
  - `task-flow-engine/flow-created`
  - `task-flow-engine/flow-updated`
  - `task-flow-engine/flow-completed`
  - `task-flow-engine/flow-removed`
  - `task-flow-engine/task-updated`
  - `task-flow-engine/task-result`

### FR-SSE-003: Module-Defined Payloads

- The Unified SSE Manager must not impose any payload structure constraints beyond wrapping it in the standard envelope.
- Each module is responsible for defining and constructing its own payload shape.
- Payloads are passed as `unknown` (or `Record<string, unknown>`) to the broadcast method.

### FR-SSE-004: Constructor Injection of SSE Manager Instance

- The Unified SSE Manager instance must be created once at application startup (e.g., in `index.ts`).
- This same instance must be injected into all modules that require event broadcasting capability.
- Modules must receive the instance via their constructors (dependency injection).
- Affected modules: `TaskFlowEngine`, `RobotService` (via `RobotCacheEventHandler`).

### FR-SSE-005: Internal Broadcast Wrappers in Modules

- Each module must encapsulate its broadcast logic internally. Modules must not expose raw `broadcast(event, payload)` calls across their public interfaces.
- `TaskFlowEngine` must provide private methods such as `emitFlowCreated()`, `emitFlowUpdated()`, `emitTaskUpdated()`, etc., which internally call `this.sseManager.broadcast(...)`.
- `RobotCacheEventHandler` must provide private methods such as `emitEntryUpdated()`, `emitEntryDeleted()`, etc., which internally call `this.sseManager.broadcast(...)`.

### FR-SSE-006: Standardized Message Envelope

- Every SSE event sent to the frontend must be wrapped in a standardized envelope.
- Envelope structure:
  ```typescript
  interface ServerEvent<T = unknown> {
    event: string;        // Event namespace, e.g., "task-flow-engine/flow-created"
    payload: T;           // Module-defined payload
    timestamp: string;    // ISO 8601 format, e.g., "2026-06-04T12:00:00.000Z"
  }
  ```
- The SSE Manager is responsible for serializing the envelope to JSON and formatting it into the SSE protocol (`event: <event>\ndata: <json>\n\n`).

### FR-SSE-007: Unified HTTP SSE Endpoint

- The backend must expose a **single** SSE endpoint: `GET /api/sse`.
- This endpoint replaces the existing `/api/sse?key=` (MemStore) and `/api/flows/events` (TaskFlowEngine) endpoints.
- All frontend EventSource connections connect to this unified endpoint.
- The endpoint returns `Content-Type: text/event-stream` with appropriate cache-control headers.

### FR-SSE-008: Connection Lifecycle Management

- The SSE Manager must maintain a registry of active client connections.
- Each client connection must have a unique identifier (UUID).
- When a client disconnects, the SSE Manager must automatically remove the client from the registry to prevent memory leaks.
- The SSE Manager must handle write failures gracefully: if `controller.enqueue()` throws (e.g., client disconnected), the client must be removed from the registry.

### FR-SSE-009: Heartbeat (Ping) Support

- The unified SSE endpoint must support periodic heartbeat (ping) messages to keep connections alive and detect zombie connections.
- The ping interval is configurable at the route level (default: 30 seconds).
- Ping events should use the `ping` event name (SSE protocol level), with payload `{ type: "ping" }`.

### FR-SSE-010: MemStore Initial State Push on Connection

- When a client connects to `/api/sse`, the server may optionally push the current state of MemStore entries.
- This logic resides in the **route layer**, not inside the SSE Manager.
- The route iterates over `memStore.listCaches()` and sends a `memstore/entry-current` event for each existing cache entry.
- This replaces the `MemStoreSseManager.subscribe()` immediate-push behavior.

### FR-SSE-011: Backward Compatibility During Migration

- During the migration period, the existing endpoints (`/api/sse?key=` and `/api/flows/events`) may remain functional but are marked deprecated.
- The unified endpoint `/api/sse` is the canonical endpoint for all new frontend code.
- The two legacy SSE Manager implementations are removed once all consumers are migrated.

---

## 3. Non-Functional Requirements

### NFR-SSE-001: Performance

- The SSE Manager must support at least 100 concurrent client connections without significant performance degradation.
- A broadcast operation must complete in O(n) time relative to the number of connected clients, where n <= 100.

### NFR-SSE-002: Memory Efficiency

- Disconnected clients must be removed from the registry immediately upon write failure.
- No memory leaks must occur under normal connection/disconnection patterns.

### NFR-SSE-003: Error Resilience

- A single client's disconnection or write failure must not affect event delivery to other clients.
- The SSE Manager must never throw an exception during `broadcast()`; all errors are caught and handled internally.

### NFR-SSE-004: Type Safety

- All code must be written in TypeScript with strict typing.
- The envelope interface must be generic (`ServerEvent<T>`) to allow modules to specify payload types while maintaining type safety in their internal wrapper methods.

---

## 4. Module Boundaries

### Within SSE Manager Scope

- Client connection registry (add/remove)
- Broadcast to all connected clients
- Message envelope construction (adding `timestamp`)
- SSE protocol serialization (`event: ...\ndata: ...\n\n`)
- Write failure handling and client cleanup

### Outside SSE Manager Scope

- Payload content definition (module responsibility)
- Event triggering business logic (module responsibility)
- HTTP route handler setup (route layer responsibility)
- MemStore current-state iteration on connection (route layer responsibility)
- Heartbeat loop implementation (route layer responsibility, using `streamSSE`)

---

## 5. Constraints

- **Technology Stack**: TypeScript + ES6 modules + Hono + `hono/streaming` (`streamSSE`).
- **No External Dependencies**: The SSE Manager must not introduce new npm dependencies beyond what the project already uses.
- **No Breaking Changes to Module APIs (initially)**: Modules continue to expose the same public methods; only their internal event emission logic changes.
- All logs and comments must be in English.
