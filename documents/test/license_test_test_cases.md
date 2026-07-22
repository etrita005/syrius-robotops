# License Test Interface Module - Test Cases

## TC-LIC-001: Session starts empty

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Backend is running in mock mode |
| Input | `GET /api/license-test/session` |
| Expected Status | 200 |
| Expected Response | `{ connected: false }` |

## TC-LIC-002: Connect validates input - empty IP

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Backend is running in mock mode |
| Input | `POST /api/license-test/connect` with `{ robotIp: "" }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_IP" }` |

## TC-LIC-003: Connect validates input - invalid port

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Backend is running in mock mode |
| Input | `POST /api/license-test/connect` with `{ robotIp: "192.168.1.1", robotPort: 0 }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_PORT" }` |

## TC-LIC-004: Connect in mock mode returns config

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Backend is running in mock mode |
| Input | `POST /api/license-test/connect` with `{ robotIp: "192.168.1.1", robotPort: 22 }` |
| Expected Status | 200 |
| Expected Response | `{ connected: true, robotIp: "192.168.1.1", robotPort: 22, config: { "clear-janitor-licenses": "100", "clear-janitor-license-type": "Trial", "clear-janitor-license-authorization-start-time": "<ISO timestamp>" } }` |

## TC-LIC-005: Connect with default port (port omitted)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Backend is running in mock mode |
| Input | `POST /api/license-test/connect` with `{ robotIp: "192.168.1.1" }` |
| Expected Status | 200 |
| Expected Response | `robotPort` defaults to `22` |

## TC-LIC-006: Read requires session

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | No active session |
| Input | `POST /api/license-test/read` |
| Expected Status | 400 |
| Expected Response | `{ error: "NO_SESSION" }` |

## TC-LIC-007: Apply updates mock config

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Connected in mock mode |
| Input | `POST /api/license-test/apply` with `{ config: { "clear-janitor-licenses": "200", "clear-janitor-license-type": "Formal", "clear-janitor-license-authorization-start-time": "2025-06-01T12:00:00Z" } }` |
| Expected Status | 200 |
| Expected Response | `{ applied: true }` |
| Postcondition | Subsequent `POST /api/license-test/read` returns applied values |

## TC-LIC-008: Disconnect clears session

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Connected in mock mode |
| Input | `POST /api/license-test/disconnect` |
| Expected Status | 200 |
| Postcondition | `GET /api/license-test/session` returns `{ connected: false }` |

## TC-LIC-009: Apply validation rejects invalid license type

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Connected in mock mode |
| Input | `POST /api/license-test/apply` with `{ config: { "clear-janitor-license-type": "Invalid" } }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LICENSE_TYPE" }` |

## TC-LIC-010: Apply validation rejects negative license count

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Connected in mock mode |
| Input | `POST /api/license-test/apply` with `{ config: { "clear-janitor-licenses": "-1" } }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LICENSES" }` |

---

## E2E Test Cases

These tests run against the full stack with backend in `--mock` mode via Playwright.

### TC-E2E-LIC-001: Default page shows license test UI

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Mock backend + Vite frontend running |
| Input | Open `/` in browser |
| Expected Behavior | Header shows "License Test". "Solutions", "Artifacts", "System Logs" not visible. "Not connected" status shown. |

### TC-E2E-LIC-002: Connect with default port populates config fields

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Mock backend + Vite frontend running |
| Input | Enter IP `192.168.1.1`, click Connect |
| Expected Behavior | Status shows "Connected to 192.168.1.1:22". Config fields populate with mock values. |

### TC-E2E-LIC-003: Connect with custom port

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Mock backend + Vite frontend running |
| Input | Enter IP `192.168.1.1`, port `2222`, click Connect |
| Expected Behavior | Status shows "Connected to 192.168.1.1:2222". |

### TC-E2E-LIC-004: Read refreshes values

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Connected in mock mode |
| Input | Change license count to `999`, click "Read License Config" |
| Expected Behavior | License count reverts to `100` (mock value). |

### TC-E2E-LIC-005: Apply and auto-read refreshes values

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Connected in mock mode |
| Input | Change license count to `200`, type to `Formal`, click "Apply License Config" |
| Expected Behavior | Success toast shown. License count reads `200`. Type shows `Formal`. |

### TC-E2E-LIC-006: Disconnect disables config

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Connected in mock mode |
| Input | Click "Disconnect" |
| Expected Behavior | Status shows "Not connected". Config fields disabled. |

### TC-E2E-LIC-007: Validation blocks empty IP

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Mock backend + Vite frontend running |
| Input | Leave IP empty, click Connect |
| Expected Behavior | "IP address is required." error shown. No backend call. |

---

## Existing Tests

All existing E2E test specs under `src/e2e-test/tests/` are skipped (`test.describe.skip`):
- `artifact-management.spec.ts`
- `cross-module.spec.ts`
- `robot-management.spec.ts`
- `solution-management.spec.ts`
- `system-logs.spec.ts`
- `task-management.spec.ts`

These specs are preserved for future re-enable when the original UI is restored.
