# Install Minimal System (Booster) — 测试用例设计文档

## 1. 概述

本文档定义 "Install Minimal System (Booster)" 功能的测试用例，覆盖后端单元测试和前端 E2E 测试。

操作流程：上传 Booster zip 包到机器人 `/tmp/booster.zip` → 解压到 `/tmp/ota` → 以 sudo 运行 `install_booster.sh`。

---

## 2. 后端单元测试

测试执行命令：`npm --workspace backend run test`（从 `src/` 目录）

### TC-BST-001: TransferBooster 上传到正确远程路径且不使用 sudo

**前置条件**：无

**测试步骤**：
1. 创建 `TestableTransferBoosterTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10", artifactId: "test-booster-id" }`

**预期结果**：
- `remoteFilePath` 等于 `/tmp/booster.zip`
- `sudo` 为 `false`（`/tmp` 不需要 root 权限）

### TC-BST-002: TransferBooster 使用 artifactService 解析本地路径

**前置条件**：无

**测试步骤**：
1. 创建 `TransferBoosterTask` 实例
2. 调用 `exec({ robotIp: "192.168.1.10", artifactId: "test-booster-id" })`，注入模拟的 `artifactService`

**预期结果**：
- `getArtifactPath` 被调用，参数为 `"test-booster-id"`
- 传给父类 `onExec` 的 `localFilePath` 等于 artifactService 返回的路径

### TC-BST-003: InstallBooster 生成正确的解压与安装命令

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallBoosterTask` 实例
2. 调用 `getSshCommand({})`

**预期结果**：
- 命令包含 `rm -rf /tmp/ota`
- 命令包含 `unzip -o /tmp/booster.zip -d /tmp/ota`
- 命令包含 `sh -c 'cd /tmp/ota; ./install_booster.sh'`
- 命令中不存在 `&& cd /tmp/ota`（避免 sudo 前缀作用在 `cd` 上）

### TC-BST-004: InstallBooster 使用 sudo

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallBoosterTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `sudo` 为 `true`

### TC-BST-005: InstallBooster 默认 commandTimeout 为 15 分钟

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallBoosterTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `commandTimeout` 等于 `900000`

### TC-BST-006: MockTransferBooster 返回模拟结果

**前置条件**：使用 `MockTransferBoosterTask`

**测试步骤**：
1. 创建 Mock 实例
2. 执行 `exec({ robotIp: "192.168.1.10", artifactId: "test-id" })`

**预期结果**：
- 返回 `{ done: true, success: true, integrityVerified: true }`
- 大约 1 秒后完成

### TC-BST-007: MockInstallBooster 返回模拟结果

**前置条件**：使用 `MockInstallBoosterTask`

**测试步骤**：
1. 创建 Mock 实例
2. 执行 `exec({ robotIp: "192.168.1.10" })`

**预期结果**：
- 返回 `{ done: true, success: true, exitCode: 0 }`
- 大约 5 秒后完成

### TC-BST-008: install-booster DAG 流程集成

**前置条件**：注册 `MockTransferBoosterTask` 与 `MockInstallBoosterTask`

**测试步骤**：
1. 构造 `transfer → install` 两步 DAG
2. 调用 `createFlow` 并等待流程结束

**预期结果**：
- 流程状态为 `COMPLETED`
- install 节点在 transfer 完成后执行

---

## 3. 前端 E2E 测试

测试执行命令：`npm --workspace e2e-test run test`（从 `src/` 目录，需要 Playwright 环境）

### TC-E2E-TASK-007: 所有任务类型的机器人选择模式

**前置条件**：登录并打开 "Task Test Solution" 的 Tasks 页面

**测试步骤**：
1. 点击 "Create your first task"
2. 查看任务类型列表

**预期结果**：
- `Robot selection: Multiple robots` 数量为 16
- "Install Minimal System (Booster)" 在任务类型列表中可见

### TC-E2E-TASK-021: Install Minimal System (Booster) 显示多机器人选择

**前置条件**：登录并打开 "GGR3 Test Solution" 的 Tasks 页面（解决方案内含 2 台机器人）

**测试步骤**：
1. 点击 "Create your first task"
2. 选择 "Install Minimal System (Booster)"
3. 点击 "Next"

**预期结果**：
- 第 2 步显示 "Select all robots" 复选框
- 勾选全选后显示 "2 robots selected"
