# Robot Power Control — Test Case Design Document

## 1. Overview

This document defines test cases for the robot power control feature (shutdown / reboot), covering:

- Backend unit tests for `RobotPowerTask`, `MockRobotPowerTask`, `RobotPowerService`, and the `POST /api/solutions/:solutionId/robots/:robotId/power` endpoint.
- Frontend E2E tests for the robot list power buttons (`TC-E2E-ROB-013` ~ `016`) and for the batch `Shutdown Robots` / `Reboot Robots` task types (`TC-E2E-TASK-021` ~ `022`).

Two entry points share one resolver implementation, so both must be verified to issue the same command:

| Entry point | Path | Task record |
|-------------|------|-------------|
| Robot list Shutdown / Reboot buttons | `RobotPowerService` → `RobotPowerTask` (direct exec) | No |
| Tasks → Shutdown Robots / Reboot Robots | DAG single node → `RobotPowerTask` | Yes |

---

## 2. Backend Unit Tests

Test execution command: `npm --workspace backend run test` (from `src/`)

### TC-PWR-001: Shutdown command targets the bootstrapper Shutdown method

**Precondition**: None

**Test Steps**:
1. Create a `TestableRobotPowerTask` instance
2. Call `getSshCommand({ powerAction: "shutdown" })`

**Expected Result**:
- Command equals `dbus-send --system --print-reply --dest=com.syriusrobotics.bootstrapper /com/syriusrobotics/bootstrapper com.syriusrobotics.bootstrapper.system.Shutdown`
- Command contains no `&&` (so sudo wrapping is applied exactly once)

### TC-PWR-002: Reboot command uses the reboot binary

**Precondition**: None

**Test Steps**:
1. Create a `TestableRobotPowerTask` instance
2. Call `getSshCommand({ powerAction: "reboot" })`
3. Call `buildParams({ robotIp: "192.168.1.10", powerAction: "reboot" })`

**Expected Result**:
- Command equals `reboot` and does not contain `dbus-send`
- `sshCommand` starts with `echo "developer" | sudo -S -p '' reboot`

### TC-PWR-003: `buildParams` forces sudo, retryCount 1, and the default command timeout

**Precondition**: None

**Test Steps**:
1. Create a `TestableRobotPowerTask` instance
2. Call `buildParams({ robotIp: "192.168.1.10", powerAction: "shutdown" })`
3. Call `buildParams({ robotIp: "192.168.1.10", powerAction: "shutdown", commandTimeout: 5000 })`

**Expected Result**:
- `sudo` is `true`
- `retryCount` is `1`
- `commandTimeout` defaults to `30000` and honors an explicit value
- `sshCommand` starts with `echo "developer" | sudo -S -p '' dbus-send --system`

### TC-PWR-004: Missing or unknown `powerAction` is rejected before connecting

**Precondition**: None

**Test Steps**:
1. Create a `TestableRobotPowerTask` instance
2. Call `buildParams({ robotIp: "192.168.1.10" })`
3. Call `buildParams({ robotIp: "192.168.1.10", powerAction: "halt" })`

**Expected Result**: Both calls throw an error mentioning `powerAction`

### TC-PWR-005: Connection loss after the power command is treated as success

**Precondition**: A test double that makes `SshCommandTask.onExec` reject

**Test Steps**:
1. Create a subclass whose `super.onExec` rejects with `SSH connection timed out after 10000ms`
2. Call `exec({ robotIp: "192.168.1.10", powerAction: "shutdown" })`

**Expected Result**:
- Result is `{ done: true, success: true, stdout: "", stderr: "", exitCode: 0 }`

### TC-PWR-006: Every power action failure is ignored and reported as success

**Precondition**: A test double that makes `SshCommandTask.onExec` reject

**Test Steps**:
1. Create a subclass whose `super.onExec` rejects with `SSH command exited with code 127. Output logged above.`
2. Call `exec({ robotIp: "192.168.1.10", powerAction: "reboot" })`

**Expected Result**:
- The call resolves with `{ done: true, success: true, stdout: "", stderr: "", exitCode: 0 }`
- Shutdown and reboot are fire-and-forget (the host goes down before the reply/SSH session can confirm), so the underlying error is only logged as a warning

### TC-PWR-007: `MockRobotPowerTask` returns a successful body

**Precondition**: None

**Test Steps**:
1. Create a `MockRobotPowerTask` instance
2. Call `exec({ powerAction: "reboot" }, { flowId: "test-power" })`

**Expected Result**:
- `done` is `true`, `success` is `true`, `exitCode` is `0`

### TC-PWR-008: `RobotPowerService` resolves the stored address and executes the action

**Precondition**: In-memory object store with a solution and one robot at `192.168.1.10:22`

**Test Steps**:
1. Register `MockRobotPowerTask` in a `ResolverRegistry` and build a `RobotPowerService`
2. Call `execute(solutionId, robotId, "shutdown")`

**Expected Result**:
- Resolves with `{ robotId, action: "shutdown" }`
- The task received `robotIp: "192.168.1.10"`, `robotPort: 22`, `powerAction: "shutdown"`

### TC-PWR-009: `RobotPowerService` throws for an unknown robot

**Precondition**: In-memory object store with a solution but no robots

**Test Steps**:
1. Call `execute(solutionId, "robot-missing", "reboot")`

**Expected Result**: Throws `ROBOT_NOT_FOUND`

### TC-PWR-010: `POST /power` rejects an invalid action with 400

**Precondition**: Solution with one robot (mock backend)

**Test Steps**:
1. Send `POST /api/solutions/{solutionId}/robots/{robotId}/power` with `{ "action": "halt" }`

**Expected Result**: Status `400`, body error is `INVALID_INPUT`

### TC-PWR-011: `POST /power` executes and returns ok for a valid action

**Precondition**: Solution with one robot (mock backend)

**Test Steps**:
1. Send `POST /api/solutions/{solutionId}/robots/{robotId}/power` with `{ "action": "shutdown" }`

**Expected Result**: Status `200`, body is `{ ok: true, robotId, action: "shutdown" }`

### TC-PWR-012: Batch DAG `shutdown-robots` completes through the flow engine

**Precondition**: `ResolverRegistry` with `MockRobotPowerTask` registered under `RobotPowerTask`

**Test Steps**:
1. Create a `user` flow with the single-node `shutdown` DAG (`powerAction: { value: "shutdown" }`) and input `{ robotIp: "192.168.1.10", robotPort: 22 }`
2. Wait for completion

**Expected Result**:
- Flow state is `COMPLETED`
- `taskStates.shutdown` is `COMPLETED`

### TC-PWR-013: Batch DAG `reboot-robots` completes through the flow engine

**Precondition**: Same registry as TC-PWR-012

**Test Steps**:
1. Create a `user` flow with the single-node `reboot` DAG (`powerAction: { value: "reboot" }`) and input `{ robotIp: "192.168.1.10", robotPort: 22 }`
2. Wait for completion

**Expected Result**:
- Flow state is `COMPLETED`
- `taskStates.reboot` is `COMPLETED`

---

## 3. E2E Test Cases

Test execution command: `npm run test:e2e` (from `src/`)

### TC-E2E-ROB-013: Robot list view shows Shutdown and Reboot buttons

**Precondition**:
- Test solution created with at least one robot via API
- Robots tab open in list view

**Test Steps**:
1. Switch to list view
2. Inspect the Actions column of a robot row

**Expected Result**:
- `Shutdown` and `Reboot` buttons are visible for the row
- `Details` and `Delete` buttons remain visible

### TC-E2E-ROB-014: Shutdown button opens a confirmation dialog and cancel sends no request

**Precondition**: Robots tab open in list view

**Test Steps**:
1. Click the row `Shutdown` button
2. Assert the "Shutdown Robot" dialog is visible
3. Click "Cancel"

**Expected Result**:
- Dialog with heading "Shutdown Robot" appears
- Dialog shows the robot alias and `address:port`
- No `POST /power` request is issued
- Dialog closes after cancel

### TC-E2E-ROB-015: Confirming shutdown sends the power request and shows a success toast

**Precondition**: Robots tab open in list view; `/api/*/power` requests recorded

**Test Steps**:
1. Click the row `Shutdown` button
2. Click the dialog primary button
3. Wait for the success notification

**Expected Result**:
- Exactly one `POST` request to `/api/solutions/{solutionId}/robots/{robotId}/power`
- Success toast visible

### TC-E2E-ROB-016: Reboot button opens the reboot confirmation dialog

**Precondition**: Robots tab open in list view

**Test Steps**:
1. Click the row `Reboot` button

**Expected Result**: Dialog with heading "Reboot Robot" appears

### TC-E2E-ROB-017: Grid view cards expose Shutdown and Reboot buttons

**Precondition**: Robots tab open in grid view

**Test Steps**:
1. Switch to grid view
2. Inspect a robot card

**Expected Result**:
- `Shutdown` and `Reboot` buttons are visible on the card
- Clicking the card body (not the buttons) still opens the Robot Details dialog

### TC-E2E-TASK-021: Shutdown Robots task type appears and completes

**Precondition**:
- Test solution created with 2 robots added
- Tasks tab open

**Test Steps**:
1. Open the Create Task modal
2. Locate "Shutdown Robots"
3. Select it, select both robots, create the task
4. Wait for the task rows to reach a terminal state

**Expected Result**:
- "Shutdown Robots" is visible with "Multiple robots" selection mode
- Two task rows are created (one flow per robot) and both reach `Completed`

### TC-E2E-TASK-022: Reboot Robots task type appears and completes

**Precondition**: Same as TC-E2E-TASK-021

**Test Steps**:
1. Open the Create Task modal
2. Locate "Reboot Robots"
3. Select it, select one robot, create the task
4. Wait for the task row to reach a terminal state

**Expected Result**:
- "Reboot Robots" is visible with "Multiple robots" selection mode
- One task row is created and reaches `Completed`

---

## 4. Test Data

| Data Item | Value | Description |
|-----------|-------|-------------|
| Test robot IP | `192.168.1.10` | Virtual address for E2E tests |
| Test robot IP 2 | `192.168.1.11` | Second robot for multi-robot tests |
| D-Bus destination | `com.syriusrobotics.bootstrapper` | Bootstrapper service name |
| D-Bus object path | `/com/syriusrobotics/bootstrapper` | Bootstrapper object path |
| D-Bus interface | `com.syriusrobotics.bootstrapper.system` | Interface owning the Shutdown method |
| Shutdown method | `com.syriusrobotics.bootstrapper.system.Shutdown` | Powers the robot off |
| Reboot command | `reboot` | Restarts the robot (elevated to `sudo reboot`) |
| Default command timeout | `30000` ms | `RobotPowerTask` command timeout |
| Mock power action delay | `1000` ms | `MockRobotPowerTask` simulation time |
| Power endpoint | `POST /api/solutions/{solutionId}/robots/{robotId}/power` | Immediate action, no task record |
| Batch task types | `shutdown-robots`, `reboot-robots` | Task Registry types |
| Expected results | `shutdown_done`, `reboot_done` | DAG expected result variables |

---

## 5. Test Coverage

| Module | Coverage Target |
|--------|----------------|
| `RobotPowerTask` | `getSshCommand()`, `buildParams()`, `powerAction` validation, failure tolerance (all failures ignored) |
| `MockRobotPowerTask` | Return value structure |
| `RobotPowerService` | Address resolution, task execution, not-found propagation |
| Robot power REST endpoint | Input validation (400) and success response |
| Batch power DAGs | Flow creation, completion, task state |
| Robots sub-interface (list / grid) | Power buttons render, confirmation dialog, request dispatch, toasts |
| Create Task modal | New task types render, robot selection, task creation |
