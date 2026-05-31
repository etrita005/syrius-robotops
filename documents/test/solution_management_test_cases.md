# Solution Management Module - Test Cases

## TC-SOL-001: Create Solution (valid input)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Backend service is running |
| Input | `POST /api/solutions` with `{ name: "Test Solution" }` |
| Expected Status | 201 |
| Expected Response | `SolutionMeta` object with `id`, `name`, `version: "1.0.0"`, `createdAt`, `updatedAt` |
| Postcondition | Solution directory skeleton created in object store; subsequent GET returns the SolutionMeta |

## TC-SOL-002: Create Solution (missing required fields)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `POST /api/solutions` with `{ description: "No name" }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_INPUT", message: "name is required." }` |

## TC-SOL-003: Get Solution Meta

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with known ID exists |
| Input | `GET /api/solutions/{id}` |
| Expected Status | 200 |
| Expected Response | Complete `SolutionMeta` object with correct `id` and `name` |

## TC-SOL-004: Get Solution (not found)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | No solution with the given ID |
| Input | `GET /api/solutions/nonexistent-id-xyz` |
| Expected Status | 404 |
| Expected Response | `{ error: "SOLUTION_NOT_FOUND" }` |

## TC-SOL-005: List Solutions

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | At least 2 solutions exist |
| Input | `GET /api/solutions` |
| Expected Status | 200 |
| Expected Response | `{ items: SolutionMeta[], corruptedIds: string[] }` with at least 2 items |

## TC-SOL-006: Update Solution Meta

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `PUT /api/solutions/{id}` with `{ name: "Updated Name" }` |
| Expected Status | 200 |
| Expected Response | Updated `SolutionMeta` with bumped version |
| Postcondition | Subsequent GET returns updated meta with bumped version |

## TC-SOL-007: Delete Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `DELETE /api/solutions/{id}` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Subsequent `GET /api/solutions/{id}` returns 404 |

## TC-SOL-008: Open Solution (track in memory)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `POST /api/solutions/{id}/open` |
| Expected Status | 200 |
| Expected Response | `SolutionMeta` object |
| Postcondition | Solution appears in `GET /api/solutions/opened` |

## TC-SOL-009: Close Solution (release from memory)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution is opened |
| Input | `POST /api/solutions/{id}/close` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Solution no longer appears in `GET /api/solutions/opened` |

## TC-SOL-010: List Opened Solutions

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | At least 1 solution has been opened |
| Input | `GET /api/solutions/opened` |
| Expected Status | 200 |
| Expected Response | Array of `OpenedSolutionEntry` objects with `id`, `name`, `openedAt` |

## TC-SOL-011: Clone Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with known content exists |
| Input | `POST /api/solutions/{id}/clone` with `{ newName: "Cloned" }` |
| Expected Status | 201 |
| Expected Response | New `SolutionMeta` with different ID, `name: "Cloned"`, `version: "1.0.0"` |
| Postcondition | Target solution directory contains all data from source; new meta written with reset version |

## TC-SOL-012: Export Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution exists |
| Input | `POST /api/solutions/{id}/export` with `{ destinationPath: "/tmp" }` |
| Expected Status | 200 |
| Expected Response | `{ filePath: "/path/to/export.zip" }` |

## TC-SOL-013: Import Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A valid ZIP archive exists |
| Input | `POST /api/solutions/import` with `{ zipPath: "/path/to/archive.zip", targetPath: "v1/solutions/{newId}" }` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | New solution appears in listing |

## TC-SOL-014: Duplicate Solution ID

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with the given ID already exists |
| Input | `POST /api/solutions` with `{ id: "existing-id", name: "Duplicate" }` |
| Expected Status | 409 |
| Expected Response | `{ error: "SOLUTION_ALREADY_EXISTS" }` |

## TC-SOL-015: Invalid Solution ID

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `POST /api/solutions` with `{ id: "invalid id!", name: "Bad ID" }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_SOLUTION_ID" }` |

## TC-ROB-001: Add Robot (valid input)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Active solution exists |
| Input | `POST /api/solutions/{solutionId}/robots` with `{ address: "192.168.1.101:22" }` |
| Expected Status | 201 |
| Expected Response | `StoredRobotData` with `address: "192.168.1.101"`, `port: 22`, `addressType: "ip"` |
| Postcondition | Robot appears in listing; frontend enriches with mock data for display |

## TC-ROB-001a: Add Robot (address with port)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Active solution exists |
| Input | Address field value `192.168.1.101:2222`, alias `Test-Robot` |
| Expected Result | Stored data has `address: "192.168.1.101"`, `port: 2222`, `addressType: "ip"` |

## TC-ROB-001b: Add Robot (address without port)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Active solution exists |
| Input | Address field value `192.168.1.101`, alias `Test-Robot` |
| Expected Result | Stored data has `address: "192.168.1.101"`, `port: 22`, `addressType: "ip"` |

## TC-ROB-001c: Add Robot (mDNS with port)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Active solution exists |
| Input | Address field value `robot-01.local:22` |
| Expected Result | Stored data has `address: "robot-01.local"`, `port: 22`, `addressType: "mdns"` |

## TC-ROB-001d: Add Robot (invalid address format)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Active solution exists |
| Input | Address field value `:22` (missing host) |
| Expected Result | 400 error with `INVALID_ROBOT_ADDRESS` |

## TC-ROB-002: List Robots

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | At least 1 robot exists in the solution |
| Input | `GET /api/solutions/{solutionId}/robots` |
| Expected Status | 200 |
| Expected Response | Array of `StoredRobotData` objects |

## TC-ROB-003: Get Robot

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A robot with known ID exists |
| Input | `GET /api/solutions/{solutionId}/robots/{robotId}` |
| Expected Status | 200 |
| Expected Response | `StoredRobotData` object with `id`, `address`, `addressType`, `alias`, `port`, `createdAt`, `updatedAt` |

## TC-ROB-004: Update Robot Alias

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A robot exists |
| Input | `PUT /api/solutions/{solutionId}/robots/{robotId}` with `{ alias: "NewAlias" }` |
| Expected Status | 200 |
| Postcondition | Subsequent GET returns updated alias |

## TC-ROB-005: Delete Robot

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A robot exists |
| Input | `DELETE /api/solutions/{solutionId}/robots/{robotId}` |
| Expected Status | 200 |
| Expected Response | `{ ok: true }` |
| Postcondition | Subsequent GET returns 404 |

## TC-ROB-006: Duplicate Robot Address

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A robot with the same address already exists in the solution |
| Input | `POST /api/solutions/{solutionId}/robots` with `{ address: "10.0.0.1:22" }` |
| Expected Status | 409 |
| Expected Response | `{ error: "ROBOT_ADDRESS_EXISTS" }` |

## TC-ROB-007: Robot Operations on Non-existent Solution

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Solution does not exist |
| Input | `GET /api/solutions/nonexistent/robots` |
| Expected Status | 404 |
| Expected Response | `{ error: "SOLUTION_NOT_FOUND" }` |

## TC-ROB-008: Get Non-existent Robot

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Solution exists but robot does not |
| Input | `GET /api/solutions/{solutionId}/robots/nonexistent` |
| Expected Status | 404 |
| Expected Response | `{ error: "ROBOT_NOT_FOUND" }` |

## TC-ROB-009: Default Alias Generation

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | Open Add Robot modal |
| Expected Result | Alias field is pre-filled with a default alias (e.g. "Robot-1") |

## TC-ROB-010: Notification Auto-Dismiss

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | A robot was just added |
| Input | Wait after adding a robot |
| Expected Result | Success notification disappears after 5 seconds |

## Backend Service Unit Tests

### TC-SOL-SVC-001 ~ TC-SOL-SVC-023: SolutionService Core Tests

| Test Case | Description | Key Assertion |
|-----------|-------------|---------------|
| TC-SOL-SVC-001 | Create solution with valid input | Returns `SolutionMeta` with correct fields |
| TC-SOL-SVC-002 | Create solution with all optional fields | All optional fields are stored |
| TC-SOL-SVC-003 | Create solution with custom ID | ID matches the custom ID |
| TC-SOL-SVC-004 | Reject invalid solution ID | Throws `INVALID_SOLUTION_ID` |
| TC-SOL-SVC-005 | Reject duplicate ID | Throws `SOLUTION_ALREADY_EXISTS` |
| TC-SOL-SVC-006 | Create directory skeleton | `_keep` file exists under each namespace |
| TC-SOL-SVC-007 | List all solutions | Returns correct count |
| TC-SOL-SVC-008 | Sort by updatedAt descending | Most recent first |
| TC-SOL-SVC-009 | Return corrupted IDs | Missing meta files detected |
| TC-SOL-SVC-010 | Get solution by ID | Returns correct meta |
| TC-SOL-SVC-011 | Throw for non-existent solution | Throws `SOLUTION_NOT_FOUND` |
| TC-SOL-SVC-012 | Update solution fields and bump version | Version incremented, fields updated |
| TC-SOL-SVC-013 | Throw when updating non-existent solution | Throws `SOLUTION_NOT_FOUND` |
| TC-SOL-SVC-014 | Not change id or createdAt on update | Immutable fields preserved |
| TC-SOL-SVC-015 | Remove a solution | Subsequent get throws |
| TC-SOL-SVC-016 | Throw when removing non-existent solution | Throws `SOLUTION_NOT_FOUND` |
| TC-SOL-SVC-017 | Open solution and track in memory | `isOpened()` returns true |
| TC-SOL-SVC-018 | List opened solutions | Returns correct entries |
| TC-SOL-SVC-019 | Close a solution | `isOpened()` returns false |
| TC-SOL-SVC-020 | Remove from opened when solution is deleted | `isOpened()` returns false after delete |
| TC-SOL-SVC-021 | Throw when opening non-existent solution | Throws `SOLUTION_NOT_FOUND` |
| TC-SOL-SVC-022 | Clone a solution | New ID, correct name and version |
| TC-SOL-SVC-023 | Throw when cloning non-existent solution | Throws `SOLUTION_NOT_FOUND` |

### TC-ROB-SVC-001 ~ TC-ROB-SVC-025: RobotService Core Tests

| Test Case | Description | Key Assertion |
|-----------|-------------|---------------|
| TC-ROB-SVC-001 | Create robot with valid IP address | Correct `address`, `port`, `addressType` |
| TC-ROB-SVC-002 | Create robot with mDNS address | `addressType: "mdns"` |
| TC-ROB-SVC-003 | Default port to 22 when not specified | `port: 22` |
| TC-ROB-SVC-004 | Use alias when provided | Alias matches input |
| TC-ROB-SVC-005 | Default alias to host when not provided | Alias matches host |
| TC-ROB-SVC-006 | Reject invalid address format | Throws `INVALID_ROBOT_ADDRESS` |
| TC-ROB-SVC-007 | Reject duplicate address in same solution | Throws `ROBOT_ADDRESS_EXISTS` |
| TC-ROB-SVC-008 | Allow same address in different solutions | Both robots created successfully |
| TC-ROB-SVC-009 | Throw when creating robot in non-existent solution | Throws `SOLUTION_NOT_FOUND` |
| TC-ROB-SVC-010 | List robots in a solution | Correct count |
| TC-ROB-SVC-011 | Return empty list for solution with no robots | Empty array |
| TC-ROB-SVC-012 | Use cached robots on subsequent calls | Same result on repeated calls |
| TC-ROB-SVC-013 | Throw when listing robots in non-existent solution | Throws `SOLUTION_NOT_FOUND` |
| TC-ROB-SVC-014 | Get a robot by ID | Correct data returned |
| TC-ROB-SVC-015 | Throw for non-existent robot | Throws `ROBOT_NOT_FOUND` |
| TC-ROB-SVC-016 | Throw for non-existent solution | Throws `SOLUTION_NOT_FOUND` |
| TC-ROB-SVC-017 | Update robot alias | Alias updated |
| TC-ROB-SVC-018 | Update robot address | Address and port updated |
| TC-ROB-SVC-019 | Update in-memory cache after update | Cache reflects update |
| TC-ROB-SVC-020 | Throw when updating non-existent robot | Throws `ROBOT_NOT_FOUND` |
| TC-ROB-SVC-021 | Reject duplicate address on update | Throws `ROBOT_ADDRESS_EXISTS` |
| TC-ROB-SVC-022 | Remove a robot | Subsequent get throws |
| TC-ROB-SVC-023 | Update in-memory cache after remove | List returns correct count |
| TC-ROB-SVC-024 | Throw when removing non-existent robot | Throws `ROBOT_NOT_FOUND` |
| TC-ROB-SVC-025 | Clear cached robots for a solution | Cache is invalidated and reloaded |
