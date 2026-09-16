# 更新算法配置 — 测试用例设计文档


## 1. 测试策略

### 1.1 测试范围

- **单元/集成测试**（`src/backend/src/test.ts`）：覆盖三个新增任务的命令拼装、参数继承、artifact 路径解析与传输联动、清理幂等性、mock 行为与模块导出。
- **E2E 测试**（`src/e2e-test/tests/task-management.spec.ts`）：覆盖前端 CreateTaskModal 中 `Update Algorithm Config` 任务类型的可见性、多机器人选择、制品参数渲染及既有任务类型回归。
- **mock 模式 E2E**：使用 `MockTransferAlgorithmConfigTask` / `MockUpdateAlgorithmConfigTask` / `MockDeleteAlgorithmConfigTask`，无需真实机器人。

### 1.2 测试框架

- 后端：`node:test` + `node:assert`，入口 `src/backend/src/test.ts`。
- E2E：Playwright，`playwright.config.ts` 自动启动 mock 后端（30002）与 Vite 前端（5174）。

### 1.3 测试用例 ID 命名

- 后端：`TC-UAC-NNN`
- E2E：`TC-E2E-UAC-NNN`

### 1.4 关联用例维护

新增任务类型后，多机器人任务类型总数为 14，既有 E2E 用例中的计数断言（`TC-E2E-TASK-007`、`TC-E2E-TASK-012`、`TC-E2E-TASK-019`、`TC-E2E-DB3-002`）由 13 更新为 14。

---

## 2. 后端用例

### TC-UAC-001：UpdateAlgorithmConfigTask 命令拼装（启用 sudo）

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 实例化 `UpdateAlgorithmConfigTask`（测试子类暴露 `getSshCommand`/`buildParams`），参数仅含 `robotIp` |
| 输入 | 调用 `getSshCommand({})` 与 `buildParams({ robotIp })` |
| 预期 | `sshCommand` 包含按顺序出现的关键片段：`unzip -o /tmp/algorithm_config_package.zip -d /opt/cosmos/etc/rdconf`、`chown -R cosmos:cosmos /opt/cosmos/etc/rdconf/config_tree`；命令字符串中**不**包含 `-d /opt/cosmos/etc/rdconf/config_tree`（制品 zip 根目录已含 `config_tree` 顶层目录，直接解压到该目录会多套一层），**不**包含 `rm -rf /opt/cosmos/etc/rdconf`（不预先清空目标目录），**不**包含 `systemctl`（不重启服务），**不**包含 `reboot`（不重启整机）；`buildParams` 返回的 `sudo === true`，`commandTimeout === 60000`，`retryCount === 1`。 |

### TC-UAC-002：DeleteAlgorithmConfigTask 命令拼装

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 实例化 `DeleteAlgorithmConfigTask` |
| 输入 | `getSshCommand({})` |
| 预期 | 返回 `rm -f /tmp/algorithm_config_package.zip`；`buildParams` 返回的 `sudo === true`。 |

### TC-UAC-003：TransferAlgorithmConfigTask 远程路径覆盖

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 实例化 `TransferAlgorithmConfigTask` |
| 输入 | `buildParams({ robotIp, robotPort, localFilePath: "/tmp/x.zip" })` |
| 预期 | 返回的 `remoteFilePath === "/tmp/algorithm_config_package.zip"`，`sudo === true`。 |

### TC-UAC-004：TransferAlgorithmConfigTask 通过 artifactService.getArtifactPath 解析本地路径并传输

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 注入 mock `artifactService`，其中 `getArtifactPath(artifactId)` 返回本地虚拟路径；stub 父类 `super.onExec` 仅断言收到的 `params.localFilePath`。 |
| 输入 | `exec({ robotIp, artifactId: "art-1" }, { artifactService })` |
| 预期 | `artifactService.getArtifactPath` 被调用一次（参数为传入的 `artifactId`）；父类 `onExec` 收到的 `localFilePath` 等于 `getArtifactPath` 的返回值；不创建/清理任何临时目录。 |

### TC-UAC-005：TransferAlgorithmConfigTask 缺失 artifactId 时直通父类

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | 不传 `artifactId`，提供 `localFilePath` 现有文件 |
| 输入 | `exec({ robotIp, localFilePath })` |
| 预期 | 不调用 `artifactService.getArtifactPath`；父类 `onExec` 收到的 `localFilePath` 等于传入值，行为与 `SshFileTransferTask` 一致。 |

### TC-UAC-006：mock 任务返回成功

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | 实例化 `MockTransferAlgorithmConfigTask`、`MockUpdateAlgorithmConfigTask`、`MockDeleteAlgorithmConfigTask` |
| 输入 | 各自调用 `exec({ robotIp, artifactId: "a" })` |
| 预期 | 三者均在合理时间内 resolve，返回 `{ done: true, success: true, ... }`。 |

### TC-UAC-007：tasks/index.ts 导出六个新增任务

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | `import { TransferAlgorithmConfigTask, UpdateAlgorithmConfigTask, DeleteAlgorithmConfigTask, MockTransferAlgorithmConfigTask, MockUpdateAlgorithmConfigTask, MockDeleteAlgorithmConfigTask } from "./tasks/index.js"` |
| 输入 | 直接读取 import 后的引用 |
| 预期 | 全部为构造函数（`typeof === "function"`）。 |

---

## 3. 前端 / E2E 用例

### TC-E2E-UAC-001：Update Algorithm Config 任务类型可见

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 解决方案中至少有 1 台机器人；进入「Tasks → Create」 |
| 步骤 | 打开 CreateTaskModal，留在 Type 步骤 |
| 预期 | 看到任务卡片 `Update Algorithm Config`，卡片显示 `Robot selection: Multiple robots`。 |

### TC-E2E-UAC-002：Update Algorithm Config 走到 Robots 步骤

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 同 TC-E2E-UAC-001 |
| 步骤 | 选中 `Update Algorithm Config` 卡片 → Next |
| 预期 | 进入 Robots 步骤，可见 `Select all robots` 复选框与机器人列表。 |

### TC-E2E-UAC-003：Update Algorithm Config 参数步骤渲染制品选择器

| 项 | 值 |
|----|-----|
| 优先级 | 高 |
| 前置条件 | 解决方案中至少 1 台机器人 |
| 步骤 | 选 `Update Algorithm Config` → Robots 选 1 台 → Next |
| 预期 | Params 步骤显示 `Algorithm config package` 字段，且为制品选择器（与 Upgrade Movebase 等 artifact 字段呈现一致）。 |

### TC-E2E-UAC-004：既有任务类型与 Update Algorithm Config 共存

| 项 | 值 |
|----|-----|
| 优先级 | 中 |
| 前置条件 | 同 TC-E2E-UAC-001 |
| 步骤 | 打开 CreateTaskModal，留在 Type 步骤 |
| 预期 | `Update Algorithm Config` 与既有任务类型（Upgrade BUP / Movebase Disk Cleanup / Upgrade Movebase / Apply Alpha2 Map / Update IoT Gateway Config / Download Alpha2 Map / Deploy AppletEngine Config / Install App / Deploy GGR3 Config）均可见；`Robot selection: Multiple robots` 计数为 14。 |

---

## 4. 验收映射

| 验收项（需求） | 覆盖用例 |
|----------------|----------|
| AC-UAC-001 | TC-E2E-UAC-001、TC-E2E-UAC-002、TC-E2E-UAC-003、TC-E2E-UAC-004 |
| AC-UAC-002 | TC-UAC-003、TC-UAC-004、TC-UAC-005 |
| AC-UAC-003 | TC-UAC-001（unzip 片段与不清空断言） |
| AC-UAC-004 | TC-UAC-001（chown 片段） |
| AC-UAC-005 | TC-UAC-001（命令不含清理）+ TC-UAC-002；真机验收（errorDag 触发） |
| AC-UAC-006 | TC-UAC-001（不含 `systemctl` / `reboot` 断言） |
| AC-UAC-007 | TC-UAC-006、TC-E2E-UAC-001~004 |
