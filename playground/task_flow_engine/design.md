# Task Flow Engine Playground — Software Design Document

## 1. Overview

A standalone Hono-based demo that manages and executes DAG task flows using the `flowed` engine. It supports:

- Creating and starting task flows (internal / user types)
- Flow-level input parameters and per-task parameter mapping
- Inter-task data passing via `requires` / `provides` mechanism
- Flow-level output parameters with expected results
- Listing flows with per-sub-task status and results
- Pausing / resuming / stopping single or batch flows
- Real-time frontend updates via SSE (including task results and flow results)
- Backend restart recovery via object-store serialization
- Automatic TTL-based cleanup of completed / failed / stopped flows

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
               │ all requires satisfied
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
| `PENDING`  | Waiting for upstream dependencies (all `requires` must be satisfied). |
| `RUNNING`  | Currently executing.                                             |
| `COMPLETED`| Finished successfully; output values published to flow-level data slots. |
| `FAILED`   | Threw an error.                                                  |
| `SKIPPED`  | Skipped because an upstream task failed or flow was stopped.     |

A sub-task transitions from `PENDING` to `RUNNING` only when **all** of its declared `requires` are satisfied by upstream tasks' `provides`. Partial dependency satisfaction does not trigger execution.

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
| `taskFlowEngine.ts`| Wraps `flowed.Flow`; manages lifecycle, state transitions, persistence, SSE, TTL cleanup. |
| `routes.ts`       | Hono REST API routes + SSE endpoint.                                       |
| `server.ts`       | Server bootstrap, static file serving, graceful shutdown.                  |

## 5. Flow Parameters

### 5.1 Flow-Level Input Parameters

When creating a flow, the caller provides an `input` object containing values that are accessible to all sub-tasks. These are passed directly to `flowed`'s `Flow.start(params)` as the first argument.

```json
{
  "type": "user",
  "input": {
    "robotIp": "192.168.1.100",
    "sshUsername": "root",
    "sshPassword": "xxx"
  },
  "expectedResults": ["robotInfo", "checkResult"],
  "dag": { ... }
}
```

The `input` object serves as the flow-level data context. Any value in `input` can be referenced by a sub-task's `requires` or mapped through `resolver.params`.

### 5.2 Per-Task Parameter Mapping

Each sub-task defines how flow-level data maps to its resolver's input parameters via `resolver.params`. The mapping supports two modes:

- **Direct reference** (string value): maps the resolver parameter to a flow-level data slot of the same name
- **Static value** (`{ "value": ... }`): provides a constant value that does not depend on flow-level data

Example:

```json
"resolver": {
  "name": "GetRobotBasicInfoTask",
  "params": {
    "robotIp": "robotIp",
    "sshUsername": "sshUsername",
    "sshPassword": "sshPassword",
    "timeout": { "value": 15000 }
  }
}
```

In this example, `robotIp`, `sshUsername`, and `sshPassword` are mapped from flow-level data slots, while `timeout` is a static value of `15000`.

### 5.3 Inter-Task Data Passing

Data flows between sub-tasks through the `requires` / `provides` mechanism provided by `flowed`:

- A sub-task declares `provides` to publish its output values to named flow-level data slots.
- A downstream sub-task declares `requires` to wait for those data slots to be populated.
- The engine ensures a sub-task only starts when **all** of its `requires` are satisfied.
- `resolver.results` maps the resolver's return value keys to flow-level data slot names.

```
┌─────────────┐    robotInfo     ┌──────────────┐    checkResult    ┌──────────────┐
│  getInfo    │─────────────────►│  checkInfo   │──────────────────►│  reportTask  │
│  provides:  │                  │  requires:   │                   │  requires:   │
│  robotInfo  │                  │  robotInfo   │                   │  checkResult │
└─────────────┘                  │  provides:   │                   └──────────────┘
                                 │  checkResult │
                                 └──────────────┘
```

### 5.4 Flow-Level Output Parameters

The caller specifies `expectedResults` when creating a flow. These are the names of flow-level data slots that should be returned when the flow completes. They are passed to `flowed`'s `Flow.start()` as the second argument.

When the flow finishes successfully, the resolved values of these data slots are captured and stored in the `FlowRecord.results` field. This allows callers to retrieve results even if the SSE connection was lost during execution.

## 6. Flow Creation JSON Format

The complete JSON structure for creating a flow:

```json
{
  "type": "user",
  "input": {
    "robotIp": "192.168.1.100",
    "sshUsername": "root",
    "sshPassword": "xxx"
  },
  "expectedResults": ["robotInfo", "checkResult"],
  "dag": {
    "tasks": {
      "getInfo": {
        "requires": [],
        "provides": ["robotInfo"],
        "resolver": {
          "name": "GetRobotBasicInfoTask",
          "params": {
            "robotIp": "robotIp",
            "sshUsername": "sshUsername",
            "sshPassword": "sshPassword"
          },
          "results": {
            "robotInfo": "robotInfo"
          }
        }
      },
      "checkInfo": {
        "requires": ["robotInfo"],
        "provides": ["checkResult"],
        "resolver": {
          "name": "CheckRobotInfoTask",
          "params": {
            "robotInfo": "robotInfo"
          },
          "results": {
            "checkResult": "checkResult"
          }
        }
      }
    }
  }
}
```

Field descriptions:

| Field              | Type     | Required | Description                                                    |
|--------------------|----------|----------|----------------------------------------------------------------|
| `type`             | string   | Yes      | `"internal"` or `"user"`.                                      |
| `input`            | object   | No       | Flow-level input parameters passed to `Flow.start()`.          |
| `expectedResults`  | string[] | No       | Names of flow-level data slots to return on completion.        |
| `dag`              | object   | Yes      | The `flowed` FlowSpec containing task definitions.             |
| `dag.tasks`        | object   | Yes      | Map of task code to TaskSpec.                                  |
| `task.requires`    | string[] | No       | Flow-level data slot names this task depends on.               |
| `task.provides`    | string[] | No       | Flow-level data slot names this task produces.                 |
| `task.resolver`    | object   | No       | Resolver specification.                                        |
| `resolver.name`    | string   | Yes      | Registered resolver class name.                                |
| `resolver.params`  | object   | No       | Maps resolver param names to flow-level data slot names or static values. |
| `resolver.results` | object   | No       | Maps resolver return value keys to flow-level data slot names. |

## 7. API Specification

| Method | Endpoint                     | Body / Query                                        | Description                                      |
|--------|------------------------------|-----------------------------------------------------|--------------------------------------------------|
| `POST` | `/api/flows`                 | `{ type, input?, expectedResults?, dag }`           | Create and start a new flow.                     |
| `GET`  | `/api/flows`                 | `?type=internal|user` (optional)                    | List flows with sub-task statuses.               |
| `GET`  | `/api/flows/:id`             | —                                                   | Get a single flow detail including results.      |
| `POST` | `/api/flows/:id/pause`       | —                                                   | Pause a single flow.                             |
| `POST` | `/api/flows/:id/resume`      | —                                                   | Resume a paused flow.                            |
| `POST` | `/api/flows/:id/stop`        | —                                                   | Stop a running/paused flow. Record is retained.  |
| `DELETE`| `/api/flows/:id`            | —                                                   | Delete a flow record. Must be stopped first.     |
| `POST` | `/api/flows/batch/pause`     | `{ ids: string[] }`                                 | Batch pause.                                     |
| `POST` | `/api/flows/batch/resume`    | `{ ids: string[] }`                                 | Batch resume.                                    |
| `POST` | `/api/flows/batch/stop`      | `{ ids: string[] }`                                 | Batch stop. Records are retained.                |
| `POST` | `/api/flows/batch/delete`    | `{ ids: string[] }`                                 | Batch delete.                                    |
| `GET`  | `/api/events`                | —                                                   | SSE endpoint for live updates.                   |
| `GET`  | `/`                          | —                                                   | Serve `public/index.html`.                       |

### 7.1 Stop vs Delete

- **Stop** (`POST /api/flows/:id/stop`): Terminates execution of a running or paused flow. The flow record is retained with state `STOPPED` and results remain queryable via `GET /api/flows/:id`. This ensures callers can retrieve results even if SSE delivery failed.
- **Delete** (`DELETE /api/flows/:id`): Removes the flow record entirely. The flow must be in a terminal state (`COMPLETED`, `FAILED`, or `STOPPED`) before deletion. If the flow is still running or paused, stop it first.

## 8. Persistence & Recovery

- **User flows** are serialized to the Object Store under `flows/<flowId>.json`.
- **Internal flows** are transient and never serialized.
- Persisted record schema:
  ```ts
  interface PersistedFlow {
    id: string;
    type: "internal" | "user";
    input?: ValueMap;
    expectedResults?: string[];
    dag: FlowSpec;
    state: FlowState;
    taskStates: Record<string, TaskState>;
    results?: ValueMap;
    serializedRunStatus?: SerializedFlowRunStatus;
    createdAt: string;
    finishedAt?: string;
  }
  ```
- On startup the backend:
  1. Scans `flows/` in the object store.
  2. Deserializes each persisted user flow.
  3. Recreates a `Flow` instance via `new Flow(dag, serializedRunStatus)`.
  4. If the high-level state was `RUNNING`, calls `start()`; if `PAUSED`, leaves it paused.
  5. If the state was `COMPLETED`, `FAILED`, or `STOPPED`, loads it as a terminal record without re-executing.
- **Recovery granularity**: A sub-task that was in-flight when the backend crashed is re-executed from the beginning because `serializedRunStatus` is captured at task boundaries (start / finish / state change), not mid-task.

## 9. Completed Flow Lifecycle & TTL Cleanup

### 9.1 Retention of Completed / Failed / Stopped Flows

Flows in terminal states (`COMPLETED`, `FAILED`, `STOPPED`) are retained in the engine to allow callers to retrieve results. This is essential because SSE delivery is not guaranteed — network interruptions or client disconnections may cause the caller to miss real-time events.

Callers can retrieve results at any time via `GET /api/flows/:id`, which returns the full flow summary including the `results` field.

### 9.2 TTL-Based Automatic Cleanup

To prevent unbounded memory and storage growth from accumulated terminal flows, the engine implements a configurable TTL (time-to-live) cleanup mechanism:

- **Default TTL**: 30 minutes after the flow enters a terminal state.
- **Cleanup interval**: The engine checks for expired flows every 5 minutes.
- **Cleanup behavior**: When a flow exceeds its TTL, the engine:
  1. Removes the flow from the in-memory map.
  2. Deletes the persisted record from the Object Store (for user flows).
  3. Broadcasts a `task-flow-engine/flow-removed` SSE event.
- **Configuration**: The TTL duration and cleanup interval can be configured via engine constructor options.

```ts
interface TaskFlowEngineOptions {
  completedFlowTtlMs?: number;   // default: 30 * 60 * 1000 (30 minutes)
  cleanupIntervalMs?: number;    // default: 5 * 60 * 1000 (5 minutes)
}
```

### 9.3 Explicit Deletion

Callers can explicitly delete a flow before the TTL expires using `DELETE /api/flows/:id`. This is recommended when the caller has successfully consumed the results and no longer needs the record.

## 10. SSE Event Format

All SSE messages are JSON with an `event` field prefixed by the module name (`task-flow-engine/`). Every message payload automatically includes a server-side `timestamp` (ISO 8601) injected by the backend broadcaster.

### 10.1 Event Types

| Event Name                            | Trigger                                    | Data Fields                                                       |
|---------------------------------------|--------------------------------------------|-------------------------------------------------------------------|
| `task-flow-engine/flow-created`       | Flow created and started                   | `{ flowId, type, state, taskStates, input, expectedResults, createdAt, timestamp }` |
| `task-flow-engine/flow-updated`       | Flow state or task state changed           | `{ flowId, type, state, taskStates, createdAt, timestamp }`       |
| `task-flow-engine/task-updated`       | Sub-task state changed                     | `{ flowId, taskName, state, timestamp }`                          |
| `task-flow-engine/task-result`        | Sub-task finished with result              | `{ flowId, taskName, state, result, timestamp }`                  |
| `task-flow-engine/flow-completed`     | Flow reached terminal state with results   | `{ flowId, state, results, finishedAt, timestamp }`               |
| `task-flow-engine/flow-removed`       | Flow deleted or TTL-cleaned                | `{ flowId, timestamp }`                                           |

### 10.2 Event Examples

```json
{
  "event": "task-flow-engine/flow-created",
  "data": {
    "flowId": "abc-123",
    "type": "user",
    "state": "RUNNING",
    "taskStates": { "getInfo": "PENDING", "checkInfo": "PENDING" },
    "input": { "robotIp": "192.168.1.100" },
    "expectedResults": ["robotInfo", "checkResult"],
    "createdAt": "2026-05-29T03:00:00.000Z",
    "timestamp": "2026-05-29T03:00:00.000Z"
  }
}
```

```json
{
  "event": "task-flow-engine/task-result",
  "data": {
    "flowId": "abc-123",
    "taskName": "getInfo",
    "state": "COMPLETED",
    "result": { "robotInfo": { "model": "MLLBA0201", "robotSn": "SQADO420250306" } },
    "timestamp": "2026-05-29T03:00:12.000Z"
  }
}
```

```json
{
  "event": "task-flow-engine/flow-completed",
  "data": {
    "flowId": "abc-123",
    "state": "COMPLETED",
    "results": {
      "robotInfo": { "model": "MLLBA0201", "robotSn": "SQADO420250306" },
      "checkResult": { "valid": true }
    },
    "finishedAt": "2026-05-29T03:00:25.000Z",
    "timestamp": "2026-05-29T03:00:25.000Z"
  }
}
```

```json
{
  "event": "task-flow-engine/flow-removed",
  "data": {
    "flowId": "abc-123",
    "timestamp": "2026-05-29T03:30:25.000Z"
  }
}
```

## 11. Frontend Design

Single-page `index.html` (vanilla JS) with three panels:

1. **Create Flow**
   - Type selector: `internal` / `user`
   - Input parameters JSON textarea
   - Expected results input (comma-separated)
   - DAG JSON textarea with "Load Example" button
   - Submit button → `POST /api/flows`

2. **Flow List**
   - Table: checkbox, ID, Type, State, Created At, Finished At
   - Expandable row showing sub-task status table with per-task results
   - Per-row actions: Pause, Resume, Stop, Delete
   - Batch actions toolbar (Pause Selected, Resume Selected, Stop Selected, Delete Selected)
   - Auto-refreshes on SSE events
   - Click on a completed flow to view its results

3. **Event Log**
   - Small scrolling panel showing last 20 SSE events for debugging.

## 12. Mock Resolver Design

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

## 13. Technology Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Backend    | Node.js, TypeScript, Hono, `flowed`, `@hono/node-server` |
| Frontend   | Vanilla HTML5 + CSS + JS (no build step)        |
| Persistence| File-system object store (`store.ts`)           |
