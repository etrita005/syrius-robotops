# Upgrade Alpha1.9 Movebase — 测试用例设计文档

## 1. 概述

本文档定义 “Upgrade Alpha1.9 Movebase” 功能的测试用例，覆盖后端单元测试和前端 E2E 测试。

操作流程：将 Alpha1.9 Movebase 离线包（`alpha1_9_movebase_offline_package-<version>.zip`）上传到机器人 `/mnt/sdcard/offlineota/alpha1_9_movebase_offline_package.zip` → 解压到 `/mnt/sdcard/offlineota` → 以 sudo 通过 `bash` 运行包内 `install_offline.sh` → 重启并校验版本。

UI 草图：`documents/ui-ux/upgrade-alpha19-movebase/`（任务类型选择、机器人选择、参数配置、确认四个步骤）。

离线包内的 `install_offline.sh` 不需要修改：

- 脚本为 Bash 脚本（`set -euo pipefail`、`local`），因此通过 `bash` 显式启动，同时避免依赖 `unzip` 恢复的可执行位。
- 脚本通过 `BASH_SOURCE` 定位自身目录，无需 `cd`。
- 脚本内部调用 `sudo`；任务本身以 sudo 运行，嵌套 sudo 以 root 身份执行，不会等待密码输入。
- 脚本安装 `cosmos-manifests` 与 `update-bionic` `5.3.2148`，并写入 `/opt/cosmos/etc/ota/version`，因此 `MatchMovebaseVersionTask` 可以直接校验期望版本 `5.3.2148`。

---

## 2. 后端单元测试

测试执行命令：`npm --workspace backend run test`（从 `src/` 目录）

### TC-A19MB-001: TransferAlpha19Movebase 上传到正确远程路径并使用 sudo

**前置条件**：无

**测试步骤**：
1. 创建 `TestableTransferAlpha19MovebaseTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10", artifactId: "test-alpha19-id" }`

**预期结果**：
- `remoteFilePath` 等于 `/mnt/sdcard/offlineota/alpha1_9_movebase_offline_package.zip`
- `sudo` 为 `true`

### TC-A19MB-002: TransferAlpha19Movebase 使用 artifactService 解析本地路径

**前置条件**：无

**测试步骤**：
1. 创建 `TransferAlpha19MovebaseTask` 实例
2. 调用 `exec({ robotIp: "192.168.1.10", artifactId: "test-alpha19-id" })`，注入模拟的 `artifactService`

**预期结果**：
- `getArtifactPath` 被调用，参数为 `"test-alpha19-id"`
- 传给父类 `onExec` 的 `localFilePath` 等于 artifactService 返回的路径

### TC-A19MB-003: TransferAlpha19Movebase 默认超时覆盖大包校验

**前置条件**：无

**测试步骤**：
1. 创建 `TestableTransferAlpha19MovebaseTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `timeout` 等于 `120000`（离线包约 856 MB，远端 SHA-256 计算可能超过通用 30 秒超时）

### TC-A19MB-004: UpgradeAlpha19Movebase 生成正确的解压与安装命令

**前置条件**：无

**测试步骤**：
1. 创建 `TestableUpgradeAlpha19MovebaseTask` 实例
2. 调用 `getSshCommand({})`

**预期结果**：
- 命令包含 `rm -rf /mnt/sdcard/offlineota/alpha1_9_movebase_offline_package-*`
- 命令包含 `unzip -o /mnt/sdcard/offlineota/alpha1_9_movebase_offline_package.zip -d /mnt/sdcard/offlineota`
- 命令包含 `bash /mnt/sdcard/offlineota/alpha1_9_movebase_offline_package-*/install_offline.sh`

### TC-A19MB-005: UpgradeAlpha19Movebase 使用 sudo

**前置条件**：无

**测试步骤**：
1. 创建 `TestableUpgradeAlpha19MovebaseTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `sudo` 为 `true`

### TC-A19MB-006: UpgradeAlpha19Movebase 默认 commandTimeout 为 30 分钟

**前置条件**：无

**测试步骤**：
1. 创建 `TestableUpgradeAlpha19MovebaseTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `commandTimeout` 等于 `1800000`

### TC-A19MB-007: MockTransferAlpha19Movebase 返回模拟结果

**前置条件**：使用 `MockTransferAlpha19MovebaseTask`

**测试步骤**：
1. 创建 Mock 实例
2. 执行 `exec({ robotIp: "192.168.1.10", artifactId: "test-id" })`

**预期结果**：
- 返回 `{ done: true, success: true, integrityVerified: true }`
- 大约 1 秒后完成

### TC-A19MB-008: MockUpgradeAlpha19Movebase 返回模拟结果

**前置条件**：使用 `MockUpgradeAlpha19MovebaseTask`

**测试步骤**：
1. 创建 Mock 实例
2. 执行 `exec({ robotIp: "192.168.1.10" })`

**预期结果**：
- 返回 `{ done: true, success: true, exitCode: 0 }`
- 大约 5 秒后完成

### TC-A19MB-009: upgrade-alpha19-movebase DAG 流程集成

**前置条件**：注册 `MockTransferAlpha19MovebaseTask` 与 `MockUpgradeAlpha19MovebaseTask`

**测试步骤**：
1. 构造 `transfer → upgrade` 两步 DAG
2. 调用 `createFlow` 并等待流程结束

**预期结果**：
- 流程状态为 `COMPLETED`
- upgrade 节点在 transfer 完成后执行

---

## 3. 前端 E2E 测试

测试执行命令：`npm --workspace e2e-test run test`（从 `src/` 目录，需要 Playwright 环境）

### TC-E2E-A19MB-001: Upgrade Alpha1.9 Movebase 任务类型可见

**前置条件**：登录并打开 "GGR3 Test Solution" 的 Tasks 页面

**测试步骤**：
1. 点击 "Create your first task"
2. 查看任务类型列表

**预期结果**：
- "Upgrade Alpha1.9 Movebase" 在任务类型列表中可见
- `Robot selection: Multiple robots` 数量为 19（新增该任务类型后的多机器人任务总数）

### TC-E2E-A19MB-002: Upgrade Alpha1.9 Movebase 显示多机器人选择

**前置条件**：登录并打开 "GGR3 Test Solution" 的 Tasks 页面（解决方案内含 2 台机器人）

**测试步骤**：
1. 点击 "Create your first task"
2. 选择 "Upgrade Alpha1.9 Movebase"
3. 点击 "Next"

**预期结果**：
- 第 2 步显示 "Select all robots" 复选框
- 勾选全选后显示 "2 robots selected"
