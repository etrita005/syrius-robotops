# RobotOps Studio

Robot Commissioning & Operations Studio — a field robot management and upgrade tool designed for FAE (Field Application Engineers).

## Project Overview

RobotOps Studio provides a unified interface for managing multiple robots in the field through Wi-Fi connectivity. It supports solution lifecycle management, artifact (firmware, map, config) management with deduplication and reference counting, and cross-solution resource sharing.

### Core Modules

| Module | Description |
|--------|-------------|
| **Solution Management** | Top-level organizational unit. All sub-resources (robots, upgrades, maps, configs, diagnostics, logs) belong to a solution. CRUD, clone, export/import (ZIP), active solution context, recent solutions. |
| **Artifact Management** | Global shared resource store for immutable large files (firmware, maps, etc.). Upload with SHA-256 deduplication, reference counting, artifact selector for cross-module use. |

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
│   └── frontend/             # React application (Vite + Carbon Design)
│       └── src/
│           ├── main.tsx, App.tsx  # App entry & root component
│           ├── api/               # Backend API client layer
│           ├── state/             # Client-side state (ActiveSolutionManager, RecentSolutionsManager)
│           ├── hooks/             # React hooks (useActiveSolution, useSolutions, etc.)
│           ├── types/             # TypeScript type definitions
│           └── components/        # UI components (solution/, artifact/, common/)
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
- OS: Windows / Linux

## Quick Start

### 1. Install Dependencies

```bash
# Backend (includes embedded Object Store)
cd src/backend
npm install

# Frontend
cd ../frontend
npm install
```

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

### 3. Start the Frontend (Dev Mode)

```bash
cd src/frontend
npm run dev
# → Frontend running at http://localhost:5173
# → Proxies /api/* requests to backend at http://localhost:30001
```

## Running Tests

### Backend Integration Tests

```bash
cd src/backend
npm test
```

The test runner starts a temporary embedded Object Store instance and API server automatically, runs all test cases, then cleans up. No external services required.

### Test Coverage

| Module | Test Cases | Description |
|--------|-----------|-------------|
| Solution Management | TC-SOL-001 ~ TC-SOL-015 | CRUD, validation, clone, version auto-increment, filter/sort |
| Artifact Management | TC-ART-001 ~ TC-ART-015 | Upload, deduplication, refCount, delete protection, audit |
| Cross-Module | TC-CROSS-001 ~ TC-CROSS-004 | Solution delete → refCount decrement, clone → refCount increment |

Test case documents: `documents/test/solution_management_test_cases.md`, `documents/test/artifact_management_test_cases.md`, `documents/test/cross_module_test_cases.md`

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

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Carbon Design System, Vite |
| Backend | Node.js, TypeScript, Hono |
| Object Store | Node.js, TypeScript, Hono (embedded, file-system based) |
