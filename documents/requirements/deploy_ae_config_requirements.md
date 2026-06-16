# 配置下位机 AE 文件 — 需求规格说明书

## 1. 概述

「配置下位机 AE 文件」（Deploy AE Config）是 RobotOps Studio 在「解决方案 → 任务」模块下新增的一项任务类型，用于将 FAE 在现场所提供的 Applet Engine（AE）配置压缩包，部署到机器人 `/opt/cosmos/bin/applet-engine/` 目录下，并通过重启机器人使新配置生效。

本任务面向 FAE 在现场快速分发与切换 AE 配置的场景，复用已有的解决方案、机器人、制品（Artifact）和任务流引擎能力。

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **AE 配置压缩包** | FAE 上传的 ZIP 文件，包含 `applet-engine` 目录所需的全部配置/二进制内容，可由 `unzip` 在 Linux 平台原生解压。 |
| **配置上传目录** | 机器人侧的临时目录 `/tmp/`，用于通过 SCP/SFTP 接收 FAE 推送的压缩包。 |
| **AE 部署目录** | 机器人侧的最终生效目录 `/opt/cosmos/bin/applet-engine/`，由 `cosmos:cosmos` 用户所有。 |
| **Deploy AE Config 任务** | 由本需求定义的任务类型，前端 `taskType.type = "deploy-ae-config"`，多机器人可选。 |
| **解压临时目录** | 机器人侧 `/tmp/ae_config_extract/` 子目录，用于解压压缩包后再行复制，避免直接污染部署目录。 |

---

## 3. 设计原则

1. **复用既有能力**：传输复用 `SshFileTransferTask`，命令执行复用 `SshCommandTask`，重启复用 `RebootRobotTask` + `WaitSshReconnectTask`，符合现有任务编排规范。
2. **解压再复制**：先在 `/tmp/` 临时目录解压，再 `cp -rf` 到 `/opt/cosmos/bin/applet-engine/`，便于发生异常时通过 errorDag 清理。
3. **最小破坏性**：默认仅以 `cp -rf` 覆盖目标目录中的同名文件，不会清空目标目录中未在压缩包内的文件，避免误删除现场已有依赖。
4. **多机并行**：与其他升级类任务一致，支持多机器人同时下发同一压缩包。
5. **与现有 UI 流程保持一致**：复用 CreateTaskModal 的 4 步向导（Type → Robots → Params → Confirm），无需新增页面。
6. **失败可观测**：任一阶段失败均通过任务流引擎统一上报，并由 errorDag 清理临时压缩包与解压目录。

---

## 4. 非目标

以下能力明确不在本需求范围内：

- 不在前端实现 AE 配置文件本身的合法性校验（如 `applet-engine` 目录结构、必要文件清单），由后端任务流仅做传输与解压级别的成功/失败判定。
- 不实现部署后的功能性验证（如调用 AE 接口确认配置生效），仅以重启完成、SSH 重连成功作为任务结束标识。
- 不支持灰度发布、滚动部署、版本回滚等复杂策略；如需回滚，FAE 应再次上传旧版本压缩包并重新执行任务。
- 不在本任务中提供配置编辑、配置预览能力。

---

## 5. 角色与权限

| 角色 | 权限 |
|------|------|
| FAE | 创建并执行 Deploy AE Config 任务、查看任务流执行状态。 |
| 高级 FAE / 技术支持 | 同 FAE。 |

本需求不引入新的鉴权逻辑，沿用 RobotOps Studio 现有 SSH 默认账号（`developer:developer`）连接机器人，并通过 `sudo` 提权执行需要 root 权限的操作。

---

## 6. 功能需求

### FR-AE-001 任务类型注册

- 前端 `src/frontend/src/data/taskRegistry.ts` 必须注册名为 `deploy-ae-config` 的任务类型。
- 显示名（`name`）：`Deploy AE Config`；描述（`description`）：`Deploy an Applet Engine config package to the robot's /opt/cosmos/bin/applet-engine directory and reboot.`
- 机器人选择模式 `robotSelection.mode = "multiple"`。

### FR-AE-002 任务参数

任务必须暴露以下参数（由 CreateTaskModal 自动渲染）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `artifactId` | `artifact` | 是 | FAE 通过制品管理上传的 AE 配置压缩包；UI 上以制品选择器展示。 |

所有路径常量（上传目录、解压临时目录、部署目录、chown 用户/组）由后端任务实现内置，前端不暴露。

### FR-AE-003 任务 DAG（主流程）

主 DAG 必须包含且仅包含以下任务节点，按依赖关系拓扑执行：

1. `transfer`：调用 `TransferAEConfigTask`，将制品下载到本地临时目录后通过 SFTP 推送到机器人 `/tmp/ae_config_package.zip`。
2. `deploy`：调用 `DeployAEConfigTask`，在机器人侧执行：
   - 检查 `/opt/cosmos/bin/applet-engine` 目录是否存在；**不存在则直接以非零退出码失败**（不会自动创建该目录）。
   - `mkdir -p /tmp/ae_config_extract`
   - `unzip -o /tmp/ae_config_package.zip -d /tmp/ae_config_extract`
   - `cp -rf /tmp/ae_config_extract/*/. /opt/cosmos/bin/applet-engine/`
     - **注意**：AE 压缩包内层包了一个外层目录，使用 `*/.` 通配符仅复制该外层目录的**内容**，不复制外层目录本身。这样 `/opt/cosmos/bin/applet-engine/` 中即为压缩包真正的有效内容。
   - `chown -R cosmos:cosmos /opt/cosmos/bin/applet-engine`
   - `rm -rf /tmp/ae_config_extract /tmp/ae_config_package.zip`
3. `reboot`：复用 `RebootRobotTask`，`ignoreFailure=true`、`retryCount=1`。
4. `wait_reconnect`：复用 `WaitSshReconnectTask`，`timeout=360000`（与 BUP/Movebase 升级一致）。

`expectedResults` 必须为 `["reconnect_done"]`。

### FR-AE-004 异常处理 DAG

errorDag 必须包含 `cleanup` 节点，调用 `DeleteAEConfigTask`：

```
rm -rf /tmp/ae_config_extract /tmp/ae_config_package.zip
```

主流程任一节点失败时，由任务流引擎触发 errorDag，确保不在机器人 `/tmp/` 目录残留临时文件。

### FR-AE-005 后端任务实现

- 新增任务类 `TransferAEConfigTask`（继承 `SshFileTransferTask`）、`DeployAEConfigTask`（继承 `SshCommandTask`）、`DeleteAEConfigTask`（继承 `SshCommandTask`）。
- 同时新增对应 mock 任务用于 mock 模式与 E2E 测试。
- 所有任务均通过 `tasks/index.ts` 导出，并在 `src/backend/src/index.ts` 中注册到 `ResolverRegistry`。

### FR-AE-006 任务执行可观测性

- 任务执行进度、成败结果、错误信息必须通过既有 SSE 通道与任务流持久化机制，向前端透出。
- 失败时必须保留具体的错误信息（stdout/stderr 关键字），以便 FAE 排查。

---

## 7. 非功能需求

### NFR-AE-001 性能

- 单机部署任务总时长（不含机器人重启自身耗时）应在 2 分钟以内（典型压缩包大小 50 MB 内、Wi-Fi 5GHz）。
- `wait_reconnect` 超时上限 6 分钟。

### NFR-AE-002 健壮性

- SFTP 传输必须开启校验（`verifyChecksum=true`），算法 SHA-256，与现有传输任务一致。
- 解压、复制、chown 命令均通过 `&&` 连接，任一步骤失败应使整个 deploy 节点失败并触发 errorDag。

### NFR-AE-003 可移植性

- 仅依赖目标机器人系统已具备的 `unzip`、`cp`、`mkdir`、`chown`、`rm`、`reboot`、`sudo` 命令；不要求在机器人侧安装额外软件。

### NFR-AE-004 安全

- 不在日志、SSE 事件中输出 SSH 密码、压缩包内容；遵循 CLAUDE.md 第 2 节 Backend Logging 与 Security 规则。
- 所有任务日志使用 Pino 结构化日志，禁止使用 `console.*`。

---

## 8. 兼容性

- 本需求不修改既有任务类型的协议与 DAG 结构，只新增任务类型。
- 既有解决方案/制品 API 无须变更。
- 数据库（对象存储）目录结构保持不变。

---

## 9. 验收标准（摘要）

| 编号 | 验收项 |
|------|--------|
| AC-AE-001 | 在任务创建向导中可见 `Deploy AE Config` 任务类型，且支持多机器人选择。 |
| AC-AE-002 | 选择制品压缩包后，可成功提交任务，后端按主 DAG 顺序执行四个节点。 |
| AC-AE-003 | 任务成功后，机器人 `/opt/cosmos/bin/applet-engine/` 目录包含压缩包内容，且属主为 `cosmos:cosmos`。 |
| AC-AE-004 | 任务成功后，机器人 `/tmp/ae_config_package.zip` 与 `/tmp/ae_config_extract/` 不再存在。 |
| AC-AE-005 | 主流程任一节点失败时，errorDag 触发，临时文件被清理；前端任务列表显示失败状态及错误信息。 |
| AC-AE-006 | mock 模式下 E2E 测试用例 TC-E2E-AE-001 ~ TC-E2E-AE-004 全部通过。 |
| AC-AE-007 | 当机器人上不存在 `/opt/cosmos/bin/applet-engine` 目录时，deploy 节点立即失败（非零退出码，stderr 含 `Deploy target not found`），任务整体失败并触发 errorDag。 |
| AC-AE-008 | 任务成功后，`/opt/cosmos/bin/applet-engine/` 中存放的是 AE 压缩包内层目录的**内容**，而不是外层包装目录本身（即不会出现 `/opt/cosmos/bin/applet-engine/<wrapper-name>/...` 这种多层嵌套）。 |
