# Task Flow Engine Playground

A standalone Hono-based demo that manages and executes DAG task flows using the `flowed` engine, with a lightweight vanilla-JS frontend.

## Features

- Create and start task flows (`internal` / `user` types)
- List flows with per-sub-task status
- Pause / resume / stop single or batch flows
- Real-time frontend updates via SSE (`task-flow-engine/*` event namespace)
- Backend restart recovery via file-system object-store serialization
- Three mock resolvers (`MockTask1`, `MockTask2`, `MockTask3`) for demonstration

## Quick Start

### Install Dependencies

```bash
cd playground/task_flow_engine
npm install
```

### Start the Server

```bash
npm start
# Server runs at http://localhost:30002
```

Options:

```bash
npx tsx src/server.ts --port 30002 --data-dir ./data
```

### Open the Frontend

Navigate to `http://localhost:30002/` in a browser.

## Project Structure

```
playground/task_flow_engine/
├── design.md          # Software design document
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts          # Hono server bootstrap
│   ├── routes.ts          # REST API routes + SSE endpoint
│   ├── taskFlowEngine.ts  # Flow lifecycle manager
│   ├── mockResolvers.ts   # MockTask1/2/3 resolvers
│   └── store.ts           # File-system object store
└── public/
    └── index.html         # Vanilla JS frontend
```

## API Reference

| Method | Endpoint                  | Description                          |
|--------|---------------------------|--------------------------------------|
| `POST` | `/api/flows`              | Create and start a new flow          |
| `GET`  | `/api/flows?type=`        | List flows (optional type filter)    |
| `POST` | `/api/flows/:id/pause`    | Pause a single flow                  |
| `POST` | `/api/flows/:id/resume`   | Resume a paused flow                 |
| `POST` | `/api/flows/:id/stop`     | Stop and delete a single flow        |
| `POST` | `/api/flows/batch/pause`  | Batch pause                          |
| `POST` | `/api/flows/batch/resume` | Batch resume                         |
| `POST` | `/api/flows/batch/stop`   | Batch stop and delete                |
| `GET`  | `/api/events`             | SSE endpoint for live updates        |

## SSE Event Format

All business events are prefixed with `task-flow-engine/`. Every payload automatically includes a server-side `timestamp` (ISO 8601):

| Event Name                           | Data                                                        |
|--------------------------------------|-------------------------------------------------------------|
| `task-flow-engine/flow-created`      | Flow summary + `timestamp`                                  |
| `task-flow-engine/flow-updated`      | Flow summary + `timestamp`                                  |
| `task-flow-engine/task-updated`      | `{ flowId, taskName, state, timestamp }`                    |
| `task-flow-engine/flow-removed`      | `{ flowId, timestamp }`                                     |

## Creating a Flow

Send a `POST /api/flows` request with a JSON body:

```json
{
  "type": "user",
  "dag": {
    "tasks": {
      "taskA": {
        "resolver": {
          "name": "MockTask1",
          "params": {
            "name": { "value": "Alpha" },
            "iterations": { "value": 3 }
          }
        },
        "provides": ["depA"]
      },
      "taskB": {
        "requires": ["depA"],
        "resolver": {
          "name": "MockTask2",
          "params": {
            "name": { "value": "Beta" },
            "iterations": { "value": 2 }
          }
        },
        "provides": ["depB"]
      }
    }
  }
}
```

- `type`: `"internal"` or `"user"`. Only `user` flows are persisted.
- `dag`: A `flowed`-compatible DAG spec. Use `MockTask1`, `MockTask2`, or `MockTask3` as resolver names.
- `provides` / `requires`: Define data dependencies between tasks.

## Persistence & Recovery

- User flows are serialized to `./data/flows/<flowId>.json`.
- Internal flows are transient.
- On restart, the server scans `./data/flows/`, recreates `flowed` instances, and resumes `RUNNING` flows automatically.
- A sub-task that was in-flight during a crash is restarted from the beginning.

## Technology Stack

| Layer      | Technology                                            |
|------------|-------------------------------------------------------|
| Backend    | Node.js, TypeScript, Hono, `flowed`, `@hono/node-server` |
| Frontend   | Vanilla HTML5 + CSS + JS (no build step)              |
| Persistence| File-system object store (`store.ts`)                 |
