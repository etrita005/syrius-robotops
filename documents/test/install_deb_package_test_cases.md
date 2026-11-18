# Install Deb Package — 测试用例设计文档

## 1. 概述

本文档定义 "Install Deb Package" 功能的测试用例，覆盖后端单元测试和前端 E2E 测试。

操作流程：上传 `.deb` artifact 到机器人 `/tmp/install_deb_package.deb` → 从 `.deb` 的 `Package` 控制字段解析包名 → 安装前执行 `apt-mark manual` → 执行 `dpkg -i --force-confold` → 安装成功后再次执行 `apt-mark manual` → 删除临时 `.deb`。

关键约束：

- 远程固定文件名不影响安装后的包名；包名由 `.deb` 内部 `Package` 字段决定。
- `apt-mark` 失败可忽略；`dpkg -i` 失败不可忽略。
- 安装脚本内部不能出现 `&&`，避免被 `SshCommandTask` 的 sudo 包装逻辑拆坏。
- 不停止 `cosmos-update-engine`，不删除 dpkg 锁，不重启机器人。
- 配置文件冲突时使用 `--force-confold` 保留机器人已有配置。

---

## 2. 后端单元测试

测试执行命令：`npm --workspace backend run test`（从 `src/` 目录）

### TC-DEB-001: TransferDebPackage 上传到固定远程路径

**前置条件**：无

**测试步骤**：
1. 创建 `TestableTransferDebPackageTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10", artifactId: "test-deb-id" }`

**预期结果**：
- `remoteFilePath` 等于 `/tmp/install_deb_package.deb`
- `sudo` 为 `false`
- `timeout` 等于 `120000`

### TC-DEB-002: TransferDebPackage 使用 artifactService 解析本地路径

**前置条件**：无

**测试步骤**：
1. 创建 `TransferDebPackageTask` 实例
2. 调用 `exec({ robotIp: "192.168.1.10", artifactId: "test-deb-id" })`，注入模拟的 `artifactService`

**预期结果**：
- `getArtifactPath` 被调用，参数为 `"test-deb-id"`
- 传给父类 `onExec` 的 `localFilePath` 等于 artifactService 返回的路径

### TC-DEB-003: 包名来自 .deb 控制字段而不是远程文件名

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDebPackageTask` 实例
2. 调用 `getSshCommand({})`

**预期结果**：
- 命令包含 `dpkg-deb -f /tmp/install_deb_package.deb Package`
- `dpkg-deb` 读取失败时执行 `exit 1`
- `apt-mark` 的参数为 `"$PACKAGE_NAME"`
- 命令中不存在 `apt-mark manual install_deb_package.deb`
- 命令中不存在 `apt-mark manual /tmp/install_deb_package.deb`

### TC-DEB-004: apt-mark 在 dpkg 之前执行

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDebPackageTask` 实例
2. 调用 `getSshCommand({})`

**预期结果**：
- 第一次 `apt-mark manual "$PACKAGE_NAME"` 的位置早于 `dpkg -i --force-confold /tmp/install_deb_package.deb`

### TC-DEB-005: dpkg 成功后再次执行 apt-mark

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDebPackageTask` 实例
2. 调用 `getSshCommand({})`

**预期结果**：
- 第二次 `apt-mark manual "$PACKAGE_NAME"` 的位置晚于 `dpkg -i`

### TC-DEB-006: 使用非交互 dpkg 且命令中不含 &&

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDebPackageTask` 实例
2. 调用 `getSshCommand({})`

**预期结果**：
- 命令包含 `DEBIAN_FRONTEND=noninteractive`
- 命令包含 `--force-confold`
- 命令不包含 `&&`
- 命令不包含 `systemctl stop`
- 命令不包含 `/var/lib/dpkg/lock`
- 命令不包含 `reboot`

### TC-DEB-007: dpkg 退出码被保留

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDebPackageTask` 实例
2. 调用 `getSshCommand({})`

**预期结果**：
- 命令包含 `INSTALL_RC=$?`
- 命令以 `exit "$INSTALL_RC"` 结束
- `dpkg -i --force-confold /tmp/install_deb_package.deb` 后没有 `|| true`

### TC-DEB-008: InstallDebPackage 使用 sudo、单次重试和 5 分钟超时

**前置条件**：无

**测试步骤**：
1. 创建 `TestableInstallDebPackageTask` 实例
2. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- `sudo` 为 `true`
- `retryCount` 等于 `1`
- `commandTimeout` 等于 `300000`

### TC-DEB-009: CleanupDebPackage 删除固定临时文件

**前置条件**：无

**测试步骤**：
1. 创建 `TestableCleanupDebPackageTask` 实例
2. 调用 `getSshCommand({})`
3. 调用 `buildParams()` 传入 `{ robotIp: "192.168.1.10" }`

**预期结果**：
- 命令等于 `rm -f /tmp/install_deb_package.deb`
- `sudo` 为 `true`

### TC-DEB-010: Mock 任务返回模拟成功结果

**前置条件**：使用三个 Mock 任务

**测试步骤**：
1. 执行 `MockTransferDebPackageTask`
2. 执行 `MockInstallDebPackageTask`
3. 执行 `MockCleanupDebPackageTask`

**预期结果**：
- transfer 返回 `{ done: true, success: true, integrityVerified: true }`，约 1 秒完成
- install 返回 `{ done: true, success: true, exitCode: 0 }`，约 3 秒完成
- cleanup 返回 `{ done: true, success: true, exitCode: 0 }`

### TC-DEB-011: install-deb-package DAG 流程集成

**前置条件**：注册 `MockTransferDebPackageTask`、`MockInstallDebPackageTask`、`MockCleanupDebPackageTask`

**测试步骤**：
1. 构造 `transfer → install` 两步 DAG
2. 调用 `createFlow` 并等待流程结束

**预期结果**：
- 流程状态为 `COMPLETED`
- `transfer` 和 `install` 任务均为 `COMPLETED`

### TC-DEB-012: install 失败时 errorDag 执行清理

**前置条件**：注册失败的 Mock install 和 `MockCleanupDebPackageTask`

**测试步骤**：
1. 构造 `transfer → install` 两步 DAG 和 errorDag
2. 调用 `createFlow` 并等待流程结束

**预期结果**：
- 流程状态为 `FAILED`
- `phase` 为 `error`
- 产生 `task-flow-engine/error-handling-completed` 事件

---

## 3. 前端 E2E 测试

测试执行命令：`npm run test:e2e`（从 `src/` 目录）

### TC-E2E-DEB-001: Install Deb Package 任务类型出现在创建任务弹窗

**前置条件**：
- 创建 `Install Deb Package Test Solution`，添加 2 台机器人
- 打开 Tasks 页面

**测试步骤**：
1. 点击 "Create your first task"
2. 查看任务类型列表

**预期结果**：`Install Deb Package` 可见

### TC-E2E-DEB-002: Install Deb Package 显示多机器人选择

**前置条件**：同 TC-E2E-DEB-001

**测试步骤**：
1. 打开创建任务弹窗
2. 统计 `Robot selection: Multiple robots`

**预期结果**：
- `Install Deb Package` 可见
- `Robot selection: Multiple robots` 数量为 20

### TC-E2E-DEB-003: Install Deb Package 进入机器人选择和参数步骤

**前置条件**：同 TC-E2E-DEB-001

**测试步骤**：
1. 选择 `Install Deb Package`
2. 点击 Next
3. 选择一台机器人
4. 点击 Next

**预期结果**：
- 机器人步骤显示 `Select all robots` 和两台机器人复选框
- 参数步骤显示 `Deb package (.deb)` 标签

### TC-E2E-DEB-004: Install Deb Package mock 流程完成

**前置条件**：
- 通过 API 上传临时 `.deb` artifact（内容无需有效，Mock 不解析）
- 解决方案包含 2 台机器人

**测试步骤**：
1. 创建任务，选择 `Install Deb Package`
2. 选择一台机器人
3. 搜索并选择上传的 artifact
4. 点击 Create，等待任务完成

**预期结果**：
- 出现 1 条 `Install Deb Package` 任务记录
- 任务结果显示 `Success`

---

## 4. 测试数据

| Data Item | Value | Description |
|-----------|-------|-------------|
| 测试机器人 IP | `192.168.1.10` | 虚拟地址 |
| 测试机器人 IP 2 | `192.168.1.11` | 多机器人测试 |
| 远程 deb 路径 | `/tmp/install_deb_package.deb` | 固定传输目标 |
| 包名来源 | `dpkg-deb -f <deb> Package` | 不从文件名推断 |
| 安装命令 | `dpkg -i --force-confold` | 保留现有配置 |
| 传输超时 | `120000` ms | 覆盖较大 deb 校验 |
| 安装超时 | `300000` ms | 5 分钟 |
| Mock transfer 延迟 | `1000` ms | 模拟上传 |
| Mock install 延迟 | `3000` ms | 模拟安装 |
| Mock cleanup 延迟 | `500` ms | 模拟清理 |
| E2E 临时 artifact | `e2e-install-deb-<uuid>.deb` | afterAll 删除 |

---

## 5. 覆盖矩阵

| Module | Coverage Target |
|--------|----------------|
| `TransferDebPackageTask` | `buildParams()`, `onExec()` artifact resolution |
| `InstallDebPackageTask` | `buildParams()`, `getSshCommand()` package name, apt-mark, dpkg, exit code |
| `CleanupDebPackageTask` | `buildParams()`, `getSshCommand()` |
| `MockTransferDebPackageTask` | Return value structure |
| `MockInstallDebPackageTask` | Return value structure |
| `MockCleanupDebPackageTask` | Return value structure |
| DAG Flow Integration | Success and errorDag cleanup |
| Frontend Task Selector | Visibility, multi-robot selection, params step |
| Frontend Mock Flow | Task creation and successful result |
