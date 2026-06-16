# RobotOps Studio

Robot Commissioning & Operations Studio — a field robot management and upgrade tool designed for FAE (Field Application Engineers).

## Project Overview

RobotOps Studio provides a unified interface for managing multiple robots in the field through Wi-Fi connectivity. It supports solution lifecycle management, artifact (firmware, map, config) management with deduplication and reference counting, and cross-solution resource sharing.

### Core Modules

| Module | Description |
|--------|-------------|
| **Solution Management** | Top-level organizational unit. All sub-resources (robots, upgrades, maps, configs, diagnostics, logs) belong to a solution. CRUD, clone, export/import (ZIP), active solution context, recent solutions. |
| **Artifact Management** | Global shared resource store for immutable large files (firmware, maps, etc.). Upload with SHA-256 deduplication, reference counting, artifact selector for cross-module use. |
| **Task Flow Engine** | DAG-based task execution engine (powered by `flowed`). Create, pause, resume, stop task flows. Built-in resolvers: SshCommandTask, SshFileTransferTask, GetRobotBasicInfoTask. SSE real-time status updates. Persistence and crash recovery for user flows. |
| **GGR Installation** | Sequence of tasks to install GGR APK on a robot: transfer APK via SFTP, stop `syriusrobotics.kuaye.service`, run `adb install -d`, start the service, and clean up the APK. Uses the Task Flow Engine with rollback support. |

### Architecture

```
┌──────────────┐       ┌──────────────────────────┐
│   Frontend   │       │         Backend           │
│  React+Vite  │ REST  │  Hono/Node + ObjectStore  │
│  Carbon UI   │──────▶│  TypeScript (single proc) │
└──────────────┘       └──────────────────────────┘
   Port 5173                   Port 30001
```

The backend calls the Object Store layer directly in-process — no intermediate HTTP server or port allocation. All persistence uses the file-system based store module.

### Directory Structure

```
syrius-robotops/
├── src/
│   ├── backend/              # Node.js API service (Hono)
│   │   └── src/
│   │       ├── index.ts          # Server entry
│   │       ├── test.ts           # Integration test runner
│   │       ├── objectStore/      # File-system object store (in-process, no HTTP)
│   │       │   └── store.ts          # Core store logic (fs-based CRUD)
│   │       ├── routes/           # REST API route handlers
│   │       ├── services/         # Business logic (SolutionService, ArtifactService, etc.)
│   │       ├── types/            # TypeScript type definitions
│   │       └── errors/           # Custom error classes
│   ├── frontend/             # React application (Vite + Carbon Design)
│   │   └── src/
│   │       ├── main.tsx, App.tsx  # App entry & root component
│   │       ├── api/               # Backend API client layer
│   │       ├── state/             # Client-side state (ActiveSolutionManager, RecentSolutionsManager)
│   │       ├── hooks/             # React hooks (useActiveSolution, useSolutions, etc.)
│   │       ├── types/             # TypeScript type definitions
│   │       └── components/        # UI components (solution/, artifact/, common/)
│   └── e2e-test/              # Playwright end-to-end tests (mock backend + browser automation)
├── playground/                    # Standalone test/demo projects (not a dependency)
│   ├── object_store/              # Independent Object Store demo
│   └── task_flow/
├── documents/
│   ├── requirements/              # Requirements specifications
│   ├── design/                    # Software design documents
│   ├── ui-ux/                     # UI/UX mockups
│   └── test/                      # Test case documents
├── CLAUDE.md                      # Project conventions & rules
└── README.md
```

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- OS: Windows / macOS / Linux

## Quick Start

### 1. Install Dependencies

Use the `src` workspace as the unified frontend/backend dependency entry:

```bash
cd src
npm install
```

This installs dependencies for all workspaces:

- `src/frontend`
- `src/backend`
- `src/e2e-test`

Legacy per-package installs under `src/frontend` or `src/backend` are no longer recommended for product packaging.

### 2. Start the Backend API

```bash
cd src/backend
npm start
# → Backend API running at http://localhost:30001
# → Data directory: ./data
```

Options:

```bash
npm start -- --port 30001 --data-dir ./data
```

**Mock mode** (skip SSH, return mock data):

```bash
npm start -- --mock
# → Mock mode enabled: SSH tasks will return mock data
```

In mock mode, `GetRobotBasicInfoTask` sleeps 3 seconds and returns a hardcoded `RobotBasicInfo` object instead of connecting to a real robot via SSH. Useful for frontend development and integration testing without physical robots.

### 3. Start the Frontend (Dev Mode)

```bash
cd src/frontend
npm run dev
# → Frontend running at http://localhost:5173
# → Proxies /api/* requests to backend at http://localhost:30001
```

## Building and Packaging

RobotOps Studio supports a product packaging workflow from `src/package.json`. The workflow builds the Vite frontend, prepares the frontend static assets for backend embedding, compiles the TypeScript backend, and then invokes `pkg` to create platform binaries.

### Build Frontend and Backend

From the repository root:

```bash
npm --prefix src run build:frontend
npm --prefix src run prepare:assets
npm --prefix src run build:backend
```

Equivalent commands from `src/`:

```bash
cd src
npm run build:frontend
npm run prepare:assets
npm run build:backend
```

Build outputs:

```text
src/frontend/dist/          # Vite static output
src/backend/dist-static/    # frontend assets prepared for pkg embedding
src/backend/dist/           # backend TypeScript output
```

### Full Packaging Command

From the repository root:

```bash
npm --prefix src run package:all
```

Equivalent command from `src/`:

```bash
cd src
npm run package:all
```

The packaging pipeline runs:

1. `build:frontend` — build React/Vite static assets into `src/frontend/dist`.
2. `prepare:assets` — copy frontend `dist` into `src/backend/dist-static` and generate `asset-manifest.json`.
3. `build:backend` — compile backend TypeScript into `src/backend/dist`.
4. `package:pkg` — package backend with embedded frontend assets using `pkg`.
5. `compress` — optionally compress generated binaries when UPX is available.
6. `verify` — organize and verify release outputs.

Expected release layout:

```text
release/
├── windows-amd64/
│   ├── robotops-studio.exe
│   └── config.example.json
├── macos-amd64/
│   ├── robotops-studio
│   └── config.example.json
├── macos-arm64/
│   ├── robotops-studio
│   └── config.example.json
├── linux-amd64/
│   ├── robotops-studio
│   └── config.example.json
└── linux-arm64/
    ├── robotops-studio
    └── config.example.json
```

### Packaging Notes

- The frontend is still built to `src/frontend/dist` first.
- Runtime delivery does not require `src/frontend/dist`; assets are embedded into the backend binary through `src/backend/dist-static` and `pkg` assets.
- External runtime configuration is provided by an optional `config.json` placed next to the executable. Use `config.example.json` as the template.
- The default local URL is `http://127.0.0.1:30001`.
- Current `pkg` targets are Node 18 based: Windows amd64, macOS amd64, macOS arm64, Linux amd64, and Linux arm64.
- First-time `pkg` execution may take a long time if base binaries are not available in the local cache. In that case `pkg` may try to build Node.js from source. CI should pre-cache pkg base binaries or use platform-specific runners.
- The `compress` step uses UPX only when available. Set `PACKAGE_COMPRESS=off` to skip compression or `PACKAGE_COMPRESS=on` to fail if compression is unavailable.

### Runtime Health Check

After building frontend assets and backend code, a lightweight runtime check can be executed without starting the HTTP server:

```bash
cd src/backend
node dist/index.js --health-check
```

The check validates configuration loading and embedded static asset availability.

### Running a Packaged Binary

Copy the platform binary to an empty directory. Optionally copy `config.example.json` to `config.json` and edit the port, data directory, log directory, or mock mode.

```bash
./robotops-studio
```

Then open:

```text
http://127.0.0.1:30001
```

Windows example:

```powershell
.\robotops-studio.exe
```

## Running Tests

### Backend Integration Tests

```bash
cd src/backend
npm test
```

The test runner starts a temporary embedded Object Store instance and API server automatically, runs all test cases, then cleans up. No external services required.

### End-to-End (E2E) Tests

E2E tests use **Playwright** for browser automation against the React frontend, with the backend running in **mock mode** (`--mock` flag). All 30 backend task resolvers use mock variants that return canned responses instead of connecting to real robots via SSH.

#### First-Time Setup

Install Chromium browser for Playwright:

```bash
cd src
npm run test:e2e:install
```

#### Running E2E Tests

All commands run from the `src/` workspace root:

```bash
cd src

npm run test:e2e           # Run all 40 tests (auto-starts servers)
npm run test:e2e:headed    # Run with browser visible
npm run test:e2e:debug     # Run in debug mode (step-through)
```

The test runner (`playwright.config.ts`) automatically:
1. Starts the mock backend on port 30002 with `--mock` flag
2. Starts the Vite frontend dev server on port 5174 with `VITE_API_TARGET=http://localhost:30002`
3. Runs all test specs
4. Stops both servers on completion

#### Running Against Already-Running Servers

For debugging or iterative development, start servers manually then run tests:

```bash
# Terminal 1: Start mock backend
cd src/backend && npx tsx src/index.ts --port 30002 --mock

# Terminal 2: Start frontend with proxy to mock backend
cd src/frontend && VITE_API_TARGET=http://localhost:30002 npx vite --port 5174

# Terminal 3: Run E2E tests
cd src/e2e-test && npx playwright test --config=playwright.manual.config.ts
```

#### E2E Test Structure

Tests are organized by business module, mapping to `documents/test/` test cases:

| Test Suite | File | Tests | Test Case IDs |
|-----------|------|-------|--------------|
| Solution Management | `tests/solution-management.spec.ts` | 7 | TC-E2E-SOL-001 ~ 007 |
| Robot Management | `tests/robot-management.spec.ts` | 9 | TC-E2E-ROB-001 ~ 009 |
| Task Management | `tests/task-management.spec.ts` | 9 | TC-E2E-TASK-001 ~ 006, 015 ~ 017 |
| Artifact Management | `tests/artifact-management.spec.ts` | 5 | TC-E2E-ART-001 ~ 005 |
| System Logs | `tests/system-logs.spec.ts` | 7 | TC-E2E-SL-001 ~ 007 |
| Cross-Module | `tests/cross-module.spec.ts` | 6 | TC-E2E-CROSS-001 ~ 006 |

Shared fixtures and API utility helpers are in `fixtures/test-fixture.ts`.

### Test Coverage

| Module | Test Cases | Description |
|--------|-----------|-------------|
| Solution Management | TC-SOL-001 ~ TC-SOL-015 | CRUD, validation, clone, version auto-increment, filter/sort |
| Artifact Management | TC-ART-001 ~ TC-ART-015 | Upload, deduplication, refCount, delete protection, audit |
| Task Flow Engine | TC-TFE-001 ~ TC-TFE-063 | Flow lifecycle, SSE, persistence, recovery, resolver registry, IoT Gateway config, GGR installation tasks |
| Cross-Module | TC-CROSS-001 ~ TC-CROSS-014 | Solution delete → refCount decrement, clone → refCount increment, GGR installation flow integration |
| GGR Installation | TC-GGR-001 ~ TC-GGR-009 | StopKuayeService, InstallGGR, StartKuayeService, DeleteGGR, TransferGGR task unit tests |
| E2E (Playwright) | TC-E2E-SOL/ROB/TASK/ART/SL/CROSS | 43 browser-based tests against mock backend |

Test case documents: `documents/test/solution_management_test_cases.md`, `documents/test/artifact_management_test_cases.md`, `documents/test/task_flow_engine_test_cases.md`, `documents/test/cross_module_test_cases.md`

## API Reference

### Solution Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/solutions` | Create solution |
| `GET` | `/api/solutions` | List solutions (supports `filter[name]`, `filter[tags]`, `sort[field]`, `sort[order]`) |
| `GET` | `/api/solutions/:id` | Get solution detail |
| `PUT` | `/api/solutions/:id` | Update solution (auto version bump) |
| `DELETE` | `/api/solutions/:id` | Delete solution (cascades refCount) |
| `POST` | `/api/solutions/:id/clone` | Clone solution |
| `POST` | `/api/solutions/:id/export` | Export solution as ZIP |
| `POST` | `/api/solutions/import` | Import solution from ZIP |

### Artifact Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/artifacts/upload` | Upload artifact (deduplication by SHA-256) |
| `POST` | `/api/artifacts/upload-batch` | Batch upload |
| `GET` | `/api/artifacts` | List artifacts (supports filter, sort, pagination) |
| `GET` | `/api/artifacts/:id` | Get artifact detail |
| `PUT` | `/api/artifacts/:id` | Update artifact metadata (tags, metadata) |
| `DELETE` | `/api/artifacts/:id` | Delete artifact (refCount must be 0) |
| `POST` | `/api/artifacts/:id/download` | Download artifact file |
| `POST` | `/api/artifacts/:id/increment-ref` | Increment refCount |
| `POST` | `/api/artifacts/:id/decrement-ref` | Decrement refCount |
| `POST` | `/api/artifacts/audit/ref-count` | Run refCount consistency audit |

### Task Flow Engine

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/flows` | Create and start a task flow (body: `{ type, dag }`) |
| `GET` | `/api/flows` | List flows (query: `?type=internal\|user`) |
| `POST` | `/api/flows/:id/pause` | Pause a running flow |
| `POST` | `/api/flows/:id/resume` | Resume a paused flow |
| `POST` | `/api/flows/:id/stop` | Stop and delete a flow |
| `POST` | `/api/flows/batch/pause` | Batch pause (body: `{ ids: string[] }`) |
| `POST` | `/api/flows/batch/resume` | Batch resume (body: `{ ids: string[] }`) |
| `POST` | `/api/flows/batch/stop` | Batch stop and delete (body: `{ ids: string[] }`) |
| `GET` | `/api/flows/events` | SSE endpoint for real-time flow/task state updates |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Carbon Design System, Vite |
| Backend | Node.js, TypeScript, Hono |
| Object Store | Node.js, TypeScript, Hono (embedded, file-system based) |
