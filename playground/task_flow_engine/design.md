# Task Flow Engine Playground — Software Design Document

## 1. Overview

A standalone Hono-based demo that manages and executes DAG task flows using the `flowed` engine. It supports:

- Creating and starting task flows (internal / user types)
- Listing flows with per-sub-task status
- Pausing / resuming / stopping single or batch flows
- Real-time frontend updates via SSE
- Backend restart recovery via object-store serialization

## 2. State Machines

### 2.1 Flow State Machine

```
        ┌─────────────┐
        │   PENDING   │◄────────────────────────┐
        └──────┬──────┘                         │
               │ start()                        │
               ▼                                │
        ┌─────────────┐   pause()      ┌───────┴───────┐
        │   RUNNING   │───────────────►│    PAUSED     │
        └──────┬──────┘                └───────┬───────┘
               │ resume()                      │
      ┌────────┼────────┐                      │
      ▼        ▼        ▼                      │
┌─────────┐ ┌───────┐ ┌─────────┐              │
│COMPLETED│ │FAILED │ │ STOPPED │──────────────┘
└─────────┘ └───────┘ └─────────┘   stop()
```

| State     | Meaning                                                            |
|-----------|--------------------------------------------------------------------|
| `PENDING` | Flow created; waiting for dependencies or not yet started.         |
| `RUNNING` | At least one sub-task is currently executing.                      |
| `PAUSED`  | Pause requested; engine halts before next task. In-flight task finishes. |
| `COMPLETED` | All tasks finished successfully.                                 |
| `FAILED`  | At least one task failed.                                          |
| `STOPPED` | Explicitly stopped by user; no further execution.                  |

### 2.2 Sub-Task State Machine

```
        ┌─────────────┐
        │   PENDING   │
        └──────┬──────┘
               │ dependencies met
               ▼
        ┌─────────────┐
        │   RUNNING   │
        └──────┬──────┘
      ┌────────┼────────┐
      ▼        ▼        ▼
┌─────────┐ ┌───────┐ ┌─────────┐
│COMPLETED│ │FAILED │ │ SKIPPED │
└─────────┘ └───────┘ └─────────┘
```

| State      | Meaning                                                          |
|------------|------------------------------------------------------------------|
| `PENDING`  | Waiting for upstream dependencies.                               |
| `RUNNING`  | Currently executing.                                             |
| `COMPLETED`| Finished successfully.                                           |
| `FAILED`   | Threw an error.                                                  |
| `SKIPPED`  | Skipped because an upstream task failed or flow was stopped.     |

## 3. Architecture

```
┌──────────────┐      SSE (events)      ┌──────────────────────────────┐
│   Browser    │◄──────────────────────│         Backend (Hono)        │
│  HTML + JS   │      REST API          │                              │
└──────────────┘───────────────────────▶│  ┌─────────┐  ┌───────────┐  │
                                        │  │ Routes  │  │TaskFlow   │  │
                                        │  │         │  │ Engine    │  │
                                        │  └────┬────┘  └─────┬─────┘  │
                                        │       │             │        │
                                        │  ┌────▼─────────────▼────┐   │
                                        │  │     ObjectStore       │   │
                                        │  │  (fs-based, JSON)     │   │
                                        │  └───────────────────────┘   │
                                        └──────────────────────────────┘
```

## 4. Backend Modules

| Module            | Responsibility                                                             |
|-------------------|----------------------------------------------------------------------------|
| `store.ts`        | File-system object store (copied from `playground/object_store`).          |
| `mockResolvers.ts`| Mock task resolvers: `for` loop + `console.log` + random sleep 1-5 s.      |
| `taskFlowEngine.ts`| Wraps `flowed.Flow`; manages lifecycle, state transitions, persistence, SSE.|
| `routes.ts`       | Hono REST API routes + SSE endpoint.                                       |
| `server.ts`       | Server bootstrap, static file serving, graceful shutdown.                  |

## 5. API Specification

| Method | Endpoint                     | Body / Query                     | Description                          |
|--------|------------------------------|----------------------------------|--------------------------------------|
| `POST` | `/api/flows`                 | `{ type, dag }`                  | Create and start a new flow.         |
| `GET`  | `/api/flows`                 | `?type=internal|user` (optional) | List flows with sub-task statuses.   |
| `POST` | `/api/flows/:id/pause`       | —                                | Pause a single flow.                 |
| `POST` | `/api/flows/:id/resume`      | —                                | Resume a paused flow.                |
| `POST` | `/api/flows/:id/stop`        | —                                | Stop and delete a single flow.       |
| `POST` | `/api/flows/batch/pause`     | `{ ids: string[] }`              | Batch pause.                         |
| `POST` | `/api/flows/batch/resume`    | `{ ids: string[] }`              | Batch resume.                        |
| `POST` | `/api/flows/batch/stop`      | `{ ids: string[] }`              | Batch stop and delete.               |
| `GET`  | `/api/events`                | —                                | SSE endpoint for live updates.       |
| `GET`  | `/`                          | —                                | Serve `public/index.html`.           |

## 6. Persistence & Recovery

- **User flows** are serialized to the Object Store under `flows/<flowId>.json`.
- **Internal flows** are transient and never serialized.
- Persisted record schema:
  ```ts
  interface PersistedFlow {
    id: string;
    type: "internal" | "user";
    dag: FlowSpec;           // flowed spec
    state: FlowState;        // our high-level state
    taskStates: Record<string, TaskState>;
    serializedRunStatus?: SerializedFlowRunStatus; // flowed internal state
    createdAt: string;
  }
  ```
- On startup the backend:
  1. Scans `flows/` in the object store.
  2. Deserializes each persisted user flow.
  3. Recreates a `Flow` instance via `new Flow(dag, serializedRunStatus)`.
  4. If the high-level state was `RUNNING`, calls `start()`; if `PAUSED`, leaves it paused.
  5. If the state was `COMPLETED`, `FAILED`, or `STOPPED`, loads it as a terminal record without re-executing.
- **Recovery granularity**: A sub-task that was in-flight when the backend crashed is re-executed from the beginning because `serializedRunStatus` is captured at task boundaries (start / finish / state change), not mid-task.

## 7. SSE Event Format

All SSE messages are JSON with an `event` field prefixed by the module name (`task-flow-engine/`). Every message payload automatically includes a server-side `timestamp` (ISO 8601) injected by the backend broadcaster:

```json
{ "event": "task-flow-engine/flow-created",   "data": { /* flow summary */, "timestamp": "2026-05-29T03:00:00.000Z" } }
{ "event": "task-flow-engine/flow-updated",   "data": { /* flow summary */, "timestamp": "2026-05-29T03:00:01.000Z" } }
{ "event": "task-flow-engine/task-updated",   "data": { "flowId": "...", "taskName": "...", "state": "...", "timestamp": "2026-05-29T03:00:02.000Z" } }
{ "event": "task-flow-engine/flow-removed",   "data": { "flowId": "...", "timestamp": "2026-05-29T03:00:03.000Z" } }
```

## 8. Frontend Design

Single-page `index.html` (vanilla JS) with three panels:

1. **Create Flow**
   - Type selector: `internal` / `user`
   - DAG JSON textarea with "Load Example" button
   - Submit button → `POST /api/flows`

2. **Flow List**
   - Table: checkbox, ID, Type, State, Created At
   - Expandable row showing sub-task status table
   - Per-row actions: Pause, Resume, Stop
   - Batch actions toolbar (Pause Selected, Resume Selected, Stop Selected)
   - Auto-refreshes on SSE `flow-updated` / `task-updated`

3. **Event Log**
   - Small scrolling panel showing last 20 SSE events for debugging.

## 9. Mock Resolver Design

Three mock resolvers (`MockTask1`, `MockTask2`, `MockTask3`) are registered with `flowed`. They all follow the same pattern (`for` loop + random sleep 5-10 s + console.log) but include their own class name in the log output:

```ts
class MockTask1 {
  async exec(params: ValueMap): Promise<ValueMap> {
    const name = params.name as string;
    const iterations = (params.iterations as number) ?? 3;
    for (let i = 1; i <= iterations; i++) {
      const sleepMs = Math.floor(Math.random() * 5000) + 5000;
      await sleep(sleepMs);
      console.log(`[${new Date().toISOString()}] [MockTask1] ${name}: iteration ${i}/${iterations}`);
    }
    return { done: true };
  }
}
```

`MockTask2` and `MockTask3` are identical except their class name in the log prefix. Front-end DAG JSON references any of these three resolver names and passes `name` / `iterations` as params.

## 10. Technology Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Backend    | Node.js, TypeScript, Hono, `flowed`, `@hono/node-server` |
| Frontend   | Vanilla HTML5 + CSS + JS (no build step)        |
| Persistence| File-system object store (`store.ts`)           |
