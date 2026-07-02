# Deploy GGR3 Config — 测试用例设计文档

> 关联设计：`documents/design/backend_task_design.md`（#30 TransferGGR3ConfigTask、#31 DeployGGR3ConfigTask、#32 DeleteGGR3ConfigTask）

---

## 1. 测试策略

### 1.1 测试范围

- **单元/集成测试**（`src/backend/src/test.ts`）：覆盖三类新增任务的命令拼装、参数继承、artifact 路径解析与传输联动、清理幂等性。
- **E2E 测试**（`src/e2e-test/tests/task-management.spec.ts`）：覆盖前端 CreateTaskModal 中「Deploy GGR3 Config」任务类型的可见性、参数渲染与多机器人选择。
- **mock 模式 E2E**：使用 `MockTransferGGR3ConfigTask` / `MockDeployGGR3ConfigTask` / `MockDeleteGGR3ConfigTask`，无需真实机器人。

### 1.2 测试框架

- 后端：`node:test` + `node:assert`，已有入口 `src/backend/src/test.ts`。
- E2E：Playwright，已有 `playwright.config.ts` 启动 mock 后端 + Vite 前端。

### 1.3 测试用例 ID 命名

- 后端：`TC-GGR3-NNN`
- E2E：`TC-E2E-GGR3-NNN`

---

## 2. 后端用例

### TC-GGR3-001：DeployGGR3ConfigTask 命令拼装（启用 sudo）

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 实例化 `DeployGGR3ConfigTask`，参数仅含 `robotIp`、`robotPort` |
| 输入 | 调用 `getSshCommand({})` 与 `buildParams({ robotIp, robotPort })` |
| 预期 | `sshCommand` 包含按顺序出现的关键片段：`[ -f /tmp/ggr3_config.zip ]` 存在性检查、`mkdir -p /tmp/ggr3_config`、`unzip -o /tmp/ggr3_config.zip -d /tmp/ggr3_config`、`adb push /tmp/ggr3_config/. /sdcard/Android/data/com.syriusrobotics.platform.launcher/files/ae/`、`rm -rf /tmp/ggr3_config /tmp/ggr3_config.zip`；命令中不包含 `reboot`；`buildParams` 返回的 `sudo === true`，`commandTimeout === 60000`，`retryCount === 1`。 |

### TC-GGR3-002：DeleteGGR3ConfigTask 命令拼装

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 实例化 `DeleteGGR3ConfigTask` |
| 输入 | `getSshCommand({})` |
| 预期 | 返回 `rm -rf /tmp/ggr3_config /tmp/ggr3_config.zip`；`buildParams` 返回的 `sudo === true`。 |

### TC-GGR3-003：TransferGGR3ConfigTask 远程路径覆盖

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 实例化 `TransferGGR3ConfigTask` |
| 输入 | `buildParams({ robotIp, robotPort, localFilePath: "/tmp/x.zip" })` |
| 预期 | 返回的 `remoteFilePath === "/tmp/ggr3_config.zip"`，`sudo === true`。 |

### TC-GGR3-004：TransferGGR3ConfigTask 通过 artifactService.getArtifactPath 解析本地路径并传输

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 注入 mock `artifactService`，其中 `getArtifactPath(artifactId)` 直接返回一个本地虚拟路径；mock 父类 `super.onExec` 仅断言 `params.localFilePath` 等于 `getArtifactPath` 的返回值。 |
| 输入 | `onExec({ artifactId: "art-1" }, { artifactService })` |
| 预期 | `artifactService.getArtifactPath` 被调用一次（参数为传入的 `artifactId`）；`super.onExec` 收到的 `params.localFilePath` 等于 `getArtifactPath` 的返回值。 |

### TC-GGR3-005：TransferGGR3ConfigTask 缺失 artifactId 时直通父类

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | 不传 `artifactId`，提供 `localFilePath` 现有文件 |
| 输入 | `onExec({ localFilePath })` |
| 预期 | 不调用 `artifactService.getArtifactPath`；行为与父类 `SshFileTransferTask` 一致。 |

### TC-GGR3-006：mock 任务返回成功

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | 实例化 `MockTransferGGR3ConfigTask`、`MockDeployGGR3ConfigTask`、`MockDeleteGGR3ConfigTask` |
| 输入 | 各自调用 `onExec({})` |
| 预期 | 三者均在合理时间内（≤6s）resolve，返回 `{ done: true, success: true, ... }`。 |

### TC-GGR3-007：tasks/index.ts 导出六个新任务类

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | `import { TransferGGR3ConfigTask, DeployGGR3ConfigTask, DeleteGGR3ConfigTask, MockTransferGGR3ConfigTask, MockDeployGGR3ConfigTask, MockDeleteGGR3ConfigTask } from "./tasks/index.js"` |
| 输入 | 直接读取 import 后的引用 |
| 预期 | 全部为构造函数（`typeof === "function"`）。 |

---

## 3. 前端 / E2E 用例

### TC-E2E-GGR3-001：Deploy GGR3 Config 任务类型可见

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 解决方案中至少有 1 台机器人；进入「Tasks → Create」 |
| 步骤 | 打开 CreateTaskModal，留在 Type 步骤 |
| 预期 | 看到任务卡片「Deploy GGR3 Config」，描述包含 GGR3 和 ADB；卡片显示 `Robot selection: Multiple robots`。 |

### TC-E2E-GGR3-002：Deploy GGR3 Config 走到 Robots 步骤

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 同 TC-E2E-GGR3-001 |
| 步骤 | 选中「Deploy GGR3 Config」卡片 → Next |
| 预期 | 进入 Robots 步骤，可见 `Select all robots` 复选框与机器人列表。 |

### TC-E2E-GGR3-003：Deploy GGR3 Config 参数步骤渲染 GGR3 Config Package 选择器

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 解决方案中至少 1 台机器人 + 至少 1 个制品 |
| 步骤 | 选「Deploy GGR3 Config」→ Robots 选 1 台 → Next |
| 预期 | Params 步骤显示「GGR3 Config Package」字段，且为制品选择器。 |

### TC-E2E-GGR3-004：现有任务类型与新类型共存

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | 同 TC-E2E-GGR3-001 |
| 步骤 | 打开 CreateTaskModal，留在 Type 步骤 |
| 预期 | 弹窗中同时可见 Upgrade BUP、Movebase Disk Cleanup、Upgrade Movebase、Apply Alpha2 Map、Update IoT Gateway Config、Download Alpha2 Map、Deploy AppletEngine Config、Deploy GGR3 Config（共计 8 个类型）。 |

---

## 4. E2E 已有测试需同步更新的项

以下已有测试由于新增了 `deploy-ggr3-config` 任务类型（多机器人模式），需要更新计数断言：

| 已有测试 ID | 变更内容 | 说明 |
|-------------|---------|------|
| TC-E2E-TASK-007 | `toHaveCount(6)` → `toHaveCount(7)` | 多机器人任务类型从 6 个增至 7 个 |
| TC-E2E-TASK-012 | `toHaveCount(6)` → `toHaveCount(7)` | 同上 |
| TC-E2E-AE-004 | 新增断言 `Deploy GGR3 Config` 可见 | 确保新任务类型与旧任务类型共存 |

---

## 5. 验收映射

| 验收项 | 覆盖用例 |
|--------|----------|
| 命令行拼装正确 | TC-GGR3-001、TC-GGR3-002、TC-GGR3-003 |
| Artifact 路径解析与传输 | TC-GGR3-004、TC-GGR3-005 |
| Mock 模式可用 | TC-GGR3-006 |
| 任务注册正确 | TC-GGR3-007、TC-E2E-GGR3-001 |
| UI 交互流程 | TC-E2E-GGR3-001、TC-E2E-GGR3-002、TC-E2E-GGR3-003 |
| 新任务不破坏已有功能 | TC-E2E-GGR3-004、TC-E2E-TASK-007、TC-E2E-TASK-012、TC-E2E-AE-004 |
| 真机验证 | ADB 连通性 + 文件推送 + 文件完整性（手动测试） |
