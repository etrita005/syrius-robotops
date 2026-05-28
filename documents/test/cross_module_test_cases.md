# Cross-Module Integration Test Cases

## TC-CROSS-001: Delete Solution decrements artifact refCount

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | An artifact exists with `refCount === 1` (referenced by a solution) |
| Input | `DELETE /api/solutions/{solutionId}` |
| Expected Result | After deletion, the artifact's `refCount` is decremented to 0 |
| Verification | `GET /api/artifacts/{artifactId}` returns `refCount === 0` |

## TC-CROSS-002: Clone Solution increments artifact refCount

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | A solution with artifact references exists; artifact has `refCount === N` |
| Input | `POST /api/solutions/{sourceId}/clone` with `{ name: "Cloned" }` |
| Expected Result | After cloning, the artifact's `refCount === N + 1` |
| Verification | `GET /api/artifacts/{artifactId}` returns incremented `refCount` |

## TC-CROSS-003: Solution creation + activation workflow

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | No active solution |
| Input | 1. Create a new solution 2. The solution becomes the active solution |
| Expected Result | The newly created solution is set as the active solution |
| Verification | Active solution ID matches the created solution ID |

## TC-CROSS-004: Deleting active solution clears context

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | An active solution exists |
| Input | Delete the currently active solution |
| Expected Result | Active solution context is cleared; user is redirected to solution selector |
| Verification | `activeSolutionManager.getActiveId() === null` |
