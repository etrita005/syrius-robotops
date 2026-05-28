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
| Expected Result | Returns `StoredRobotData` (only id, address, addressType, alias, timestamps); no model/SN/version fields in stored data |
| Verification | Frontend `enrichRobot()` produces full `RobotDefinition` with mock dynamic data |

## TC-CROSS-005: Clone solution copies robot data

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with robots exists |
| Input | `POST /api/objects/clone` to clone the solution |
| Expected Result | Cloned solution contains copies of all robot `StoredRobotData` objects |
| Verification | `GET /api/objects/list/v1/solutions/{newId}/robots` returns same robot count as source |
