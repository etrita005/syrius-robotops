# Solution Management Module - Test Cases

## TC-SOL-001: Create Solution (valid input)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Object Store service is running |
| Input | `PUT /api/objects/v1/solutions/{id}/meta` with SolutionMeta body |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Solution directory skeleton created in object store; subsequent GET returns the SolutionMeta |

## TC-SOL-002: Create Solution (missing required fields)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `PUT /api/objects/v1/solutions/test-id/meta` with empty object `{}` |
| Expected Result | Object is stored; frontend validation should prevent this case |

## TC-SOL-003: Get Solution Meta

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with known ID exists |
| Input | `GET /api/objects/v1/solutions/{id}/meta` |
| Expected Status | 200 |
| Expected Response | Complete `SolutionMeta` object with correct `id` and `name` |

## TC-SOL-004: Get Solution (not found)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | No solution with the given ID |
| Input | `GET /api/objects/v1/solutions/nonexistent-id-xyz/meta` |
| Expected Status | 404 |
| Expected Response | `{ error: "NOT_FOUND" }` |

## TC-SOL-005: List Solutions

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | At least 2 solutions exist |
| Input | `GET /api/objects/list/v1/solutions` |
| Expected Status | 200 |
| Expected Response | Array of `ObjectStoreResource` with `type: "directory"` for each solution |

## TC-SOL-006: Update Solution Meta

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | Frontend reads current meta, merges changes, `PUT /api/objects/v1/solutions/{id}/meta` with updated SolutionMeta |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Subsequent GET returns updated meta with bumped version |

## TC-SOL-007: Delete Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `DELETE /api/objects/v1/solutions/{id}` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Subsequent `GET /api/objects/v1/solutions/{id}/meta` returns 404 |

## TC-SOL-008: Clone Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with known content exists |
| Input | `POST /api/objects/clone` with `{ sourcePath: "v1/solutions/{sourceId}", targetPath: "v1/solutions/{newId}" }` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Target solution directory contains all data from source; new meta written with reset version |

## TC-SOL-009: Export Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `POST /api/objects/export` with `{ sourcePath: "v1/solutions/{id}" }` |
| Expected Status | 200 |
| Expected Response | `{ filePath: "/path/to/export.zip" }` |

## TC-SOL-010: Import Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A valid ZIP archive exists |
| Input | `POST /api/objects/import` with `{ zipPath: "/path/to/archive.zip", targetPath: "v1/solutions/{newId}" }` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | New solution appears in listing |

## TC-ROB-001: Add Robot (valid input)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Active solution exists |
| Input | `PUT /api/objects/v1/solutions/{solutionId}/robots/{robotId}` with `StoredRobotData` body |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Robot appears in listing; frontend enriches with mock data for display |

## TC-ROB-002: List Robots

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | At least 1 robot exists in the solution |
| Input | `GET /api/objects/list/v1/solutions/{solutionId}/robots` |
| Expected Status | 200 |
| Expected Response | Array of `ObjectStoreResource` including robot entries |

## TC-ROB-003: Get Robot

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A robot with known ID exists |
| Input | `GET /api/objects/v1/solutions/{solutionId}/robots/{robotId}` |
| Expected Status | 200 |
| Expected Response | `StoredRobotData` object with `id`, `address`, `addressType`, `alias`, `createdAt`, `updatedAt` |

## TC-ROB-004: Update Robot Alias

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A robot exists |
| Input | Frontend reads current data, updates alias, `PUT /api/objects/v1/solutions/{solutionId}/robots/{robotId}` |
| Expected Status | 200 |
| Postcondition | Subsequent GET returns updated alias |

## TC-ROB-005: Delete Robot

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A robot exists |
| Input | `DELETE /api/objects/v1/solutions/{solutionId}/robots/{robotId}` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Subsequent GET returns 404 |

## TC-ROB-006: Default Alias Generation

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | Open Add Robot modal |
| Expected Result | Alias field is pre-filled with a default alias (e.g. "Robot-1") |

## TC-ROB-007: Notification Auto-Dismiss

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | A robot was just added |
| Input | Wait after adding a robot |
| Expected Result | Success notification disappears after 5 seconds |
