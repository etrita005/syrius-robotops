# Solution Management Module - Test Cases

## TC-SOL-001: Create Solution (valid input)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Object Store service is running |
| Input | `POST /api/solutions` with `{ name: "Test Solution Alpha", description: "A test solution", tags: ["test", "alpha"] }` |
| Expected Status | 201 |
| Expected Response | `SolutionMeta` with auto-generated `id`, `name === "Test Solution Alpha"`, `version === "1.0.0"`, `refCount` tags included, `createdAt` and `updatedAt` set to current UTC |
| Postcondition | Solution directory skeleton created in object store |

## TC-SOL-002: Create Solution (missing name)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `POST /api/solutions` with `{ description: "No name" }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_NAME" }` |

## TC-SOL-003: Create Solution (duplicate ID)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with the target ID already exists |
| Input | `POST /api/solutions` with `{ id: "dup-test-id", name: "Second" }` |
| Expected Status | 409 |
| Expected Response | `{ error: "SOLUTION_ALREADY_EXISTS" }` |

## TC-SOL-004: Create Solution (invalid ID format)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `POST /api/solutions` with `{ id: "invalid id!", name: "Bad ID" }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_SOLUTION_ID" }` |

## TC-SOL-005: List Solutions

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | At least 2 solutions exist |
| Input | `GET /api/solutions` |
| Expected Status | 200 |
| Expected Response | `{ items: SolutionMeta[], corruptedIds: string[] }` with `items.length >= 2`, sorted by `updatedAt` descending |

## TC-SOL-006: List Solutions (filter by name)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | A solution with "Alpha" in its name exists |
| Input | `GET /api/solutions?filter[name]=Alpha` |
| Expected Status | 200 |
| Expected Response | All returned items have name containing "Alpha" (case-insensitive) |

## TC-SOL-007: Get Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with known ID exists |
| Input | `GET /api/solutions/{id}` |
| Expected Status | 200 |
| Expected Response | Complete `SolutionMeta` object with correct `id` and `name` |

## TC-SOL-008: Get Solution (not found)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | No solution with the given ID |
| Input | `GET /api/solutions/nonexistent-id-xyz` |
| Expected Status | 404 |
| Expected Response | `{ error: "SOLUTION_NOT_FOUND" }` |

## TC-SOL-009: Update Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `PUT /api/solutions/{id}` with `{ name: "After Update", description: "Updated description" }` |
| Expected Status | 200 |
| Expected Response | `SolutionMeta` with `name === "After Update"`, `version === "1.0.1"` (patch bumped) |

## TC-SOL-010: Update Solution (immutable fields)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | A solution exists |
| Input | `PUT /api/solutions/{id}` with `{ name: "Updated Name" }` |
| Expected Status | 200 |
| Expected Response | `id` and `createdAt` remain unchanged from original values |

## TC-SOL-011: Delete Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `DELETE /api/solutions/{id}` |
| Expected Status | 204 |
| Postcondition | Subsequent `GET /api/solutions/{id}` returns 404 |

## TC-SOL-012: Delete Solution (not found)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | No solution with the given ID |
| Input | `DELETE /api/solutions/nonexistent-delete-id` |
| Expected Status | 404 |
| Expected Response | `{ error: "SOLUTION_NOT_FOUND" }` |

## TC-SOL-013: Clone Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with known content exists |
| Input | `POST /api/solutions/{sourceId}/clone` with `{ name: "Cloned Solution" }` |
| Expected Status | 201 |
| Expected Response | `SolutionMeta` with `name === "Cloned Solution"`, different `id`, `version === "1.0.0"`, new `createdAt`/`updatedAt` |

## TC-SOL-014: Version auto-increment on multiple updates

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | A solution exists with `version === "1.0.0"` |
| Input | Update solution 3 times |
| Expected Result | `version === "1.0.3"` after 3 updates |

## TC-SOL-015: Create Solution with name exceeding 128 characters

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | None |
| Input | `POST /api/solutions` with `name` of 129+ characters |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_NAME" }` |
