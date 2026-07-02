# Download Alpha2 Map — 测试用例设计文档

## 1. 概述

本文档定义 "Download Alpha2 Map" 功能的测试用例，覆盖后端单元测试和前端 E2E 测试。

---

## 2. 后端单元测试

测试执行命令：`npm --workspace backend run test`

### TC-UNIT-DOWNLOAD-001: 参数构建使用默认值

**前置条件**：无

**测试步骤**：
1. 创建 `SshFileDownloadTask` 实例
2. 调用 `buildParams()` 传入最小参数 `{ robotIp: "10.0.0.1", remoteFilePath: "/tmp/test.zip", localTargetDir: "/tmp/out" }`

**预期结果**：
- `robotPort` 默认为 `22`
- `timeout` 默认为 `30000`
- `retryCount` 默认为 `3`
- `sshUsername` 默认为 `developer`
- `sshPassword` 默认为 `developer`
- `verifyChecksum` 默认为 `true`
- `checksumAlgorithm` 默认为 `sha256`

### TC-UNIT-DOWNLOAD-002: Mock 任务返回模拟结果

**前置条件**：使用 `MockSshFileDownloadTask`

**测试步骤**：
1. 创建 Mock 实例
2. 执行 `exec({ robotIp: "192.168.1.10", remoteFilePath: "/opt/cosmos/map/preview/sketch.zip", localTargetDir: "/tmp" })`

**预期结果**：
- 返回 `{ done: true, success: true, bytesTransferred: 0, localFilePath: "/tmp/sketch.zip", localChecksum: "", remoteChecksum: "", integrityVerified: true }`
- 执行时间约 5 秒（sleep）

### TC-UNIT-DOWNLOAD-003: 任务注册到 ResolverRegistry

**前置条件**：无

**测试步骤**：
1. 创建 `ResolverRegistry` 实例
2. 注册 `SshFileDownloadTask` 和 `MockSshFileDownloadTask`

**预期结果**：
- `registry.has("SshFileDownloadTask")` 返回 `true`
- `registry.get("SshFileDownloadTask")` 返回有效的 TaskResolverClass

### TC-UNIT-DOWNLOAD-004: DAG 验证 — 解析器已注册

**前置条件**：engine 中已注册 `SshFileDownloadTask`

**测试步骤**：
1. 使用 `DOWNLOAD_ALPHA2_MAP_DAG` 创建 flow
2. 验证 flow 创建成功（不抛 "not registered" 错误）

**预期结果**：flow 成功创建并启动

### TC-UNIT-DOWNLOAD-005: Flow 输入传递到 resolver 参数

**前置条件**：使用 `MockSshFileDownloadTask`，通过 DAG 创建 flow

**测试步骤**：
1. 创建 flow，input 包含 `{ robotIp: "10.0.0.1", robotPort: 22, localTargetDir: "/home/user/downloads" }`
2. 等待 flow 完成
3. 检查 task result

**预期结果**：task result 中 `localFilePath` 为 `/home/user/downloads/sketch.zip`

---

## 3. E2E 测试用例

测试执行命令：`npm run test:e2e` (from src/)

### TC-E2E-DOWNLOAD-001: 任务类型出现在选择列表中

**前置条件**：
- 已创建测试 Solution 并添加一个机器人
- 打开 Solution workspace

**测试步骤**：
1. 进入 Tasks 标签页
2. 点击 "Create your first task" 按钮
3. 在任务类型列表中搜索 "Download Alpha2 Map"

**预期结果**：
- 列表中显示 "Download Alpha2 Map" 任务类型
- 描述文本正确显示

### TC-E2E-DOWNLOAD-002: 任务创建模态框 — 参数配置

**前置条件**：已打开任务创建模态框，"Download Alpha2 Map" 已选中

**测试步骤**：
1. 选择一个机器人
2. 进入 Params 步骤
3. 验证 localTargetDir 文本输入框可见并默认值为 "/tmp"

**预期结果**：
- 输入框 label 为 "Local target directory"
- 默认值为 "/tmp"

### TC-E2E-DOWNLOAD-003: 确认步骤显示正确信息

**前置条件**：已完成 Type、Robots、Params 步骤

**测试步骤**：
1. 进入 Confirm 步骤
2. 验证显示信息

**预期结果**：
- 显示 "Task Type: Download Alpha2 Map"
- 显示选中的机器人名称
- 显示 "Local target directory: /tmp"

### TC-E2E-DOWNLOAD-004: 创建任务并验证任务列表更新

**前置条件**：已配置好参数并确认

**测试步骤**：
1. 点击 "Create" 按钮
2. 验证模态框关闭
3. 验证任务列表中出现新任务
4. 等待任务执行完成（mock 模式下约 5 秒）
5. 验证任务状态变为 "Success"

**预期结果**：
- 任务列表中出现 "Download Alpha2 Map" 任务
- 任务在 mock 模式下最终状态为 Success
- 显示 "1 completed" 结果摘要

---

## 4. 测试数据

| 数据项 | 值 | 说明 |
|--------|-----|------|
| 测试机器人地址 | `192.168.1.10` | E2E 测试用虚拟地址 |
| 远程文件路径 | `/opt/cosmos/map/preview/sketch.zip` | 固定值 |
| 目标目录 | `/tmp` | 默认下载目录 |
| Mock 延迟 | `5000ms` | Mock 模式模拟时间 |

---

## 5. 测试覆盖率目标

| 模块 | 目标覆盖率 | 说明 |
|------|-----------|------|
| `SshFileDownloadTask` | 参数构建分支全覆盖 | `buildParams` 方法 |
| `MockSshFileDownloadTask` | 返回值验证 | `onExec` 方法 |
| DAG + Flow | 端到端流程 | Flow 创建、执行、完成 |
| 前端任务选择器 | UI 交互 | Modal 步骤流转 |
