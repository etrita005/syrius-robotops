# Cross-Module Integration Test Cases

## TC-CROSS-001: Delete Solution does not affect artifact storage

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | An artifact exists (managed by ArtifactService) |
| Input | `DELETE /api/objects/v1/solutions/{solutionId}` |
| Expected Result | Artifact files remain intact in `/api/artifacts/...`; only solution directory is deleted |
| Verification | `GET /api/artifacts/{artifactId}` still returns artifact data |

## TC-CROSS-002: Solution creation + activation workflow

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | No active solution |
| Input | 1. Create a new solution via `PUT /api/objects/v1/solutions/{id}/meta` 2. Frontend sets it as active solution |
| Expected Result | The newly created solution is set as the active solution |
| Verification | Active solution ID matches the created solution ID |

## TC-CROSS-003: Deleting active solution clears context

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | An active solution exists |
| Input | Delete the currently active solution |
| Expected Result | Active solution context is cleared; user is redirected to solution selector |
| Verification | `activeSolutionManager.getActiveId() === null` |

## TC-CROSS-004: Robot data uses generic object store

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with robots exists |
| Input | Read robot data via `GET /api/objects/v1/solutions/{id}/robots/{robotId}` |
| Expected Result | Returns `StoredRobotData` (only id, address, addressType, alias, port, timestamps); no model/SN/version fields in stored data |
| Verification | Frontend `enrichRobot()` produces full `RobotDefinition` with mock dynamic data |

## TC-CROSS-005: Clone solution copies robot data

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with robots exists |
| Input | `POST /api/objects/clone` to clone the solution |
| Expected Result | Cloned solution contains copies of all robot `StoredRobotData` objects |
| Verification | `GET /api/objects/list/v1/solutions/{newId}/robots` returns same robot count as source |

## TC-CROSS-006: Multi-robot upgrade creates N taskFlows

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with 3 robots (each with unique IP/port). TaskFlowEngine initialized with UpgradeMovebase task resolvers registered. |
| Input | Frontend creates an "upgrade-movebase" task with `robotIds: ["r1", "r2", "r3"]` |
| Expected Result | 3 separate user taskFlows are created. Each flow has `input.robotIds` as a single-element array, and `input.robotIp`/`input.robotPort` matching the respective robot. |
| Verification | `listFlows("user", { solutionId })` returns 3 flows. Each flow's `input.robotIds.length === 1`. Each flow's `input.robotIp` corresponds to the correct robot. |

## TC-CROSS-007: Single-robot upgrade creates 1 taskFlow

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with 1 robot. |
| Input | Frontend creates an "upgrade-bup" task with `robotIds: ["r1"]` |
| Expected Result | 1 user taskFlow is created with `input.robotIds: ["r1"]`. |
| Verification | `listFlows("user", { solutionId })` returns 1 flow. |

## TC-CROSS-008: Multi-robot task shows N rows in task list

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Created upgrade tasks for 3 robots. |
| Input | Frontend loads the task list for the solution. |
| Expected Result | Task list shows 3 rows, each with the corresponding robot alias. |
| Verification | Each task row displays a single robot alias matching the respective robot. |

## TC-CROSS-009: Missing robot in createTask is skipped

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Create task with robotIds including a robot ID that no longer exists in the solution. |
| Input | `robotIds: ["r1", "r2-gone"]` where r2-gone is not in robotData |
| Expected Result | Only 1 taskFlow is created (for r1). Robots not found in robotData are silently skipped. |
| Verification | `listFlows` returns 1 flow for r1 only. |

## TC-CROSS-010: Update IoT Gateway Config task creates taskFlows per robot

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with 2 robots. |
| Input | Frontend creates an "update-iot-gateway-config" task with `robotIds: ["r1", "r2"]` |
| Expected Result | 2 user taskFlows are created. Each flow has `input.robotIds` as a single-element array. |
| Verification | `listFlows("user", { solutionId })` returns 2 flows. Each flow's `input.robotIds.length === 1`. |

## TC-CROSS-011: Update IoT Gateway Config task has reboot step with ignoreFailure

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | A solution with 1 robot. |
| Input | Frontend creates an "update-iot-gateway-config" task for 1 robot |
| Expected Result | The DAG includes a `reboot` node with `ignoreFailure: true` and `retryCount: 1` |
| Verification | The DAG tasks.reboot.resolver.params has `ignoreFailure: { value: true }` and `retryCount: { value: 1 }` |
