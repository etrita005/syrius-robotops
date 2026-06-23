# Install Dragonball3 — 测试用例设计文档

## 1. 概述

本文档定义 "Install Dragonball3" 功能的测试用例，覆盖后端单元测试和前端 E2E 测试。

---

## 2. 后端单元测试

测试执行命令：`npm --workspace backend run test`（从 `src/` 目录）

### TC-DB3-001: TransferDragonball3 上传到正确远程路径

**前置条件**：无

**测试步骤**：
1. 创建 `TestableTransferDragonball3Task` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10", artifactId: "test-db3-id" }`

**预期结果**：
- `remoteFilePath` 等于 `/tmp/dragonball3_package.deb`
- `sudo` 为 `true`

### TC-DB3-002: TransferDragonball3 使用 artifactService 解析本地路径

**前置条件**：无

**测试步骤**：
1. 创建 `TransferDragonball3Task` 实例（非 Testable，通过 exec 测试）
2. 调用 `exec({ robotIp: "192.168.1.10", artifactId: "test-id" })`，dispatch 到模拟的 artifactService

**预期结果**：
- `getArtifactPath` 被调用，参数为 `"test-id"`
- 最终 `localFilePath` 包含 artifactService 返回的路径

### TC-DB3-003: InstallDragonball3 生成正确的安装命令

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDragonball3Task` 实例
2. 调用 `getSshCommand()`

**预期结果**：
- 命令内容为 `dpkg -i /tmp/dragonball3_package.deb`

### TC-DB3-004: InstallDragonball3 使用 sudo

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDragonball3Task` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `sudo` 为 `true`

### TC-DB3-005: InstallDragonball3 默认 commandTimeout 为 5 分钟

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDragonball3Task` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `commandTimeout` 等于 `300000`

### TC-DB3-006: MockTransferDragonball3 返回模拟结果

**前置条件**：使用 `MockTransferDragonball3Task`

**测试步骤**：
1. 创建 Mock 实例
2. 执行 `exec({ robotIp: "192.168.1.10", artifactId: "test-id" })`

**预期结果**：
- 返回 `{ done: true, success: true, ... }`
- 大约 1 秒后完成
- 不需要 artifactService

### TC-DB3-007: MockInstallDragonball3 返回模拟结果

**前置条件**：使用 `MockInstallDragonball3Task`

**测试步骤**：
1. 创建 Mock 实例
2. 执行 `exec({ robotIp: "192.168.1.10" })`

**预期结果**：
- 返回 `{ done: true, success: true, ... }`
- 大约 5 秒后完成

### TC-DB3-008: 4 步 Dragonball3 DAG 完整执行成功

**前置条件**：Mock 任务和已有任务全部注册到 engine

**测试步骤**：
1. 创建 `TaskFlowEngine`，注册 `MockTransferDragonball3Task`、`MockInstallDragonball3Task`、`MockWaitSshReconnectTask`、`MockRebootRobotTask`
2. 使用 `INSTALL_DRAGONBALL3_DAG` 创建 flow
3. 等待 flow 完成

**预期结果**：
- Flow 达到 `COMPLETED` 状态
- `detect_reboot` 为 `COMPLETED`
- `transfer` 为 `COMPLETED`
- `install` 为 `COMPLETED`
- `reboot` 为 `COMPLETED`

### TC-DB3-009: 当 install 失败时 errorDAG 清理任务执行

**前置条件**：使用 FailingMockInstall 注册

**测试步骤**：
1. 创建 `FailingMockInstallDragonball3Task`（onExec 抛出错误）
2. 注册到 engine，创建 flow
3. 等待 flow 完成

**预期结果**：
- Flow 达到 `FAILED` 状态
- `phase` 为 `error`
- `error_cleanup` 任务被执行

---

## 3. E2E 测试用例

测试执行命令：`npm run test:e2e`（从 `src/` 目录）

### TC-E2E-DB3-001: Install Dragonball3 任务类型出现在创建任务模态框

**前置条件**：
- "Task Test Solution" 已创建，且包含 2 台机器人
- Tasks tab 打开

**测试步骤**：
1. 点击 "Create your first task" 按钮
2. 在任务类型列表中查找 "Install Dragonball3"

**预期结果**：
- "Install Dragonball3" 在任务类型列表中可见

### TC-E2E-DB3-002: Install Dragonball3 显示多机器人选择

**前置条件**：创建任务模态框已打开

**测试步骤**：
1. 检查模态框内容

**预期结果**：
- "Install Dragonball3" 可见
- "Robot selection: Multiple robots" 可见
- 多机器人模式的数量计数包含新的任务类型

### TC-E2E-DB3-003: Install Dragonball3 进入机器人选择步骤后显示复选框

**前置条件**：创建任务模态框已打开

**测试步骤**：
1. 点击 "Install Dragonball3" 任务类型
2. 点击 "Next"
3. 检查机器人选择复选框

**预期结果**：
- "Select all robots" 复选框可见
- 机器人复选框（192.168.1.10, 192.168.1.11）可见

---

## 4. 测试数据

| 数据项 | 值 | 说明 |
|--------|-------|-------------|
| 测试机器人 IP | `192.168.1.10` | E2E 测试虚拟地址 |
| 测试机器人 IP 2 | `192.168.1.11` | 第二台机器人 |
| 远程 deb 路径 | `/tmp/dragonball3_package.deb` | 固定传输目标 |
| 安装命令 | `dpkg -i /tmp/dragonball3_package.deb` | 安装命令 |
| 重启检测超时 | `600000` ms (10 min) | 默认等待用户重启超时 |
| 安装超时 | `300000` ms (5 min) | 默认安装超时 |
| Mock 传输延迟 | `1000` ms | 模拟上传时间 |
| Mock 安装延迟 | `5000` ms | 模拟安装时间 |

---

## 5. 测试覆盖

| 模块 | 覆盖目标 |
|------|----------|
| `TransferDragonball3Task` | `buildParams()`, `onExec()` artifact 解析 |
| `InstallDragonball3Task` | `buildParams()`, `getSshCommand()` |
| `MockTransferDragonball3Task` | 返回值和延迟 |
| `MockInstallDragonball3Task` | 返回值和延迟 |
| DAG 流集成 | Flow 创建、完成、错误处理 |
| 前端任务选择器 | UI 渲染、步骤导航 |