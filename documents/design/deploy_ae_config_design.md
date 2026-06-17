# 配置下位机 AE 文件 — 软件设计文档

> 关联需求：`documents/requirements/deploy_ae_config_requirements.md`
> 关联测试用例：`documents/test/deploy_ae_config_test_cases.md`
> 关联 UI 草图：`documents/ui-ux/solution-management/tasks/`

---

## 1. 总体架构

本功能在 RobotOps Studio 既有「Solution → Task → Task Flow Engine → Task Resolver」框架下扩展，不引入新模块：

```
┌──────────────────────────┐    ┌────────────────────────┐    ┌─────────────────────────────┐
│ Frontend                 │    │ Backend                │    │ Robot                       │
│ - CreateTaskModal        │--->│ - taskFlowRoutes       │--->│ /tmp/                       │
│ - taskRegistry.ts        │    │ - TaskFlowEngine       │    │   └─ ae_config_package.zip  │
│   (deploy-ae-config DAG) │    │ - ResolverRegistry     │    │     (transient, removed)    │
└──────────────────────────┘    │ - TransferAEConfigTask │    │ /opt/cosmos/bin/            │
                                │ - DeployAEConfigTask   │--->│   applet-engine/  (chown    │
                                │ - DeleteAEConfigTask   │    │   cosmos:cosmos)            │
                                │ - RebootRobotTask*     │    │                             │
                                │ - WaitSshReconnectTask*│    │                             │
                                └────────────────────────┘    └─────────────────────────────┘
                                       *复用既有任务
```

---

## 2. 文件清单

### 2.1 新增文件

| 路径 | 说明 |
|------|------|
| `src/backend/src/tasks/real/transferAEConfigTask.ts` | 上传 AE 配置压缩包到 `/tmp/ae_config_package.zip` |
| `src/backend/src/tasks/real/deployAEConfigTask.ts` | 解压、复制、chown 的 SSH 复合命令 |
| `src/backend/src/tasks/real/deleteAEConfigTask.ts` | 清理 `/tmp/` 上的临时压缩包与解压目录 |
| `src/backend/src/tasks/mock/mockTransferAEConfigTask.ts` | mock 模式实现 |
| `src/backend/src/tasks/mock/mockDeployAEConfigTask.ts` | mock 模式实现 |
| `src/backend/src/tasks/mock/mockDeleteAEConfigTask.ts` | mock 模式实现 |
| `documents/requirements/deploy_ae_config_requirements.md` | 需求规格 |
| `documents/design/deploy_ae_config_design.md` | 本文 |
| `documents/test/deploy_ae_config_test_cases.md` | 测试用例 |
| `documents/ui-ux/solution-management/tasks/07_deploy_ae_config_step3_params.png` | UI 草图（由 `tools/generate_ui_sketches.py` 生成） |

### 2.2 修改文件

| 路径 | 修改点 |
|------|--------|
| `src/frontend/src/data/taskRegistry.ts` | 注册 `deploy-ae-config` 任务类型与 DAG/errorDag |
| `src/backend/src/tasks/index.ts` | 导出新增 6 个任务类 |
| `src/backend/src/index.ts` | 在 `registerTasks(...)` 中注册新增任务 |
| `documents/design/backend_task_design.md` | 追加新增任务条目 |
| `tools/generate_ui_sketches.py` | 新增 `Deploy AE Config` 参数页草图 |

---

## 3. 路径与命令规范

### 3.1 路径常量

| 名称 | 值 | 说明 |
|------|----|------|
| `REMOTE_PACKAGE_PATH` | `/tmp/ae_config_package.zip` | 通过 SFTP 上传后的压缩包位置 |
| `REMOTE_DEPLOY_DIR`   | `/opt/cosmos/bin/applet-engine`         | 最终部署目录（也是 unzip 的目标目录） |
| `DEPLOY_OWNER`        | `cosmos:cosmos`                          | chown 的目标用户:组 |

### 3.2 deploy 节点的 SSH 命令

由 `DeployAEConfigTask.getSshCommand()` 生成（启用 sudo 包装）：

```sh
[ -d /opt/cosmos/bin/applet-engine ] || { echo "Deploy target not found: /opt/cosmos/bin/applet-engine" >&2; exit 1; } \
&& unzip -o /tmp/ae_config_package.zip -d /opt/cosmos/bin/applet-engine \
&& chown -R cosmos:cosmos /opt/cosmos/bin/applet-engine \
&& rm -f /tmp/ae_config_package.zip
```

`SshCommandTask.buildParams` 已自动将每个 `&&` 段独立加 `sudo -S -p ''` 前缀。

**关键说明**：
- 第一段是目标目录存在性校验，目录不存在时整个命令链立即以非零退出码失败，后续步骤不再执行。本任务**不会**自动创建 `/opt/cosmos/bin/applet-engine` 目录——该目录的创建被视为机器人系统的前置条件。
- 直接使用 `unzip -o` 将压缩包解压到部署目录：`-o` 参数表示同名文件覆盖（不提示），不会清空目录中未在压缩包内的既有文件。不再使用任何 `/tmp/ae_config_extract` 中转目录。

### 3.3 cleanup 节点的 SSH 命令

由 `DeleteAEConfigTask.getSshCommand()` 生成：

```sh
rm -f /tmp/ae_config_package.zip
```

errorDag 与主流程都依赖该任务（主流程在 `deploy` 自身已清理；errorDag 仍执行一次以保证幂等）。

---

## 4. DAG 设计

### 4.1 主 DAG

```
input: { robotIp, robotPort, artifactId }

transfer (TransferAEConfigTask)
  requires: robotIp, robotPort, artifactId
  provides: transfer_done

deploy (DeployAEConfigTask)
  requires: robotIp, robotPort, transfer_done
  provides: deploy_done

reboot (RebootRobotTask, ignoreFailure=true, retryCount=1)
  requires: robotIp, robotPort, deploy_done
  provides: reboot_done

wait_reconnect (WaitSshReconnectTask, timeout=360000)
  requires: robotIp, robotPort, reboot_done
  provides: reconnect_done

expectedResults: [reconnect_done]
```

### 4.2 errorDag

```
error_cleanup (DeleteAEConfigTask)
  requires: robotIp, robotPort
  provides: error_cleanup_done
```

---

## 5. 后端任务详细设计

### 5.1 `TransferAEConfigTask`

继承 `SshFileTransferTask`，参考 [transferAlpha2MapTask.ts](file:///c:/Users/Administrator/Project/syrius-robotops/syrius-robotops/src/backend/src/tasks/real/transferAlpha2MapTask.ts) 模式：

- 覆盖 `buildParams`：固定 `remoteFilePath = REMOTE_PACKAGE_PATH`、`sudo = true`。
- 覆盖 `onExec`：通过 context 中的 `artifactService.getArtifactPath(artifactId)` 解析制品在本地的路径，并将其作为 `localFilePath` 注入参数后调用 `super.onExec` 进行 SFTP 传输（参考 `TransferBUPTask`）；不再创建/清理临时目录。
- 输入参数：继承 `SshFileTransferTask` + `artifactId`。
- 输出：与 `SshFileTransferTask` 一致。

### 5.2 `DeployAEConfigTask`

继承 `SshCommandTask`，参考 [applyAlpha2MapTask.ts](file:///c:/Users/Administrator/Project/syrius-robotops/syrius-robotops/src/backend/src/tasks/real/applyAlpha2MapTask.ts) 模式：

- 覆盖 `buildParams`：`sudo = true`，`commandTimeout = 60000`。
- 覆盖 `getSshCommand`：返回 §3.2 中的复合命令字符串。
- 输入参数：继承 `SshCommandTask`，无新增。
- 输出：与 `SshCommandTask` 一致。

### 5.3 `DeleteAEConfigTask`

继承 `SshCommandTask`：

- 覆盖 `buildParams`：`sudo = true`。
- 覆盖 `getSshCommand`：返回 §3.3 中的清理命令字符串。
- 既被主流程 `deploy` 节点（间接，由 `deploy` 命令最后一段实现等价语义）所替代，又被 errorDag 显式调用以保证清理幂等。

### 5.4 mock 任务

参考 `mockTransferAlpha2MapTask.ts` / `mockApplyAlpha2MapTask.ts` / `mockDeleteAlpha2MapTask.ts`：

- `MockTransferAEConfigTask`：sleep 3s 后返回成功。
- `MockDeployAEConfigTask`：sleep 5s 后返回成功。
- `MockDeleteAEConfigTask`：sleep 1s 后返回成功。

mock 任务用于 mock 模式下的 E2E 测试，确保流程编排能在不连接真实机器人的情况下走完。

### 5.5 注册

`src/backend/src/index.ts` 的 `registerTasks([...])` 数组中新增三项：

```ts
{ name: "TransferAEConfigTask", real: TransferAEConfigTask, mock: MockTransferAEConfigTask },
{ name: "DeployAEConfigTask",   real: DeployAEConfigTask,   mock: MockDeployAEConfigTask },
{ name: "DeleteAEConfigTask",   real: DeleteAEConfigTask,   mock: MockDeleteAEConfigTask },
```

---

## 6. 前端设计

在 [taskRegistry.ts](file:///c:/Users/Administrator/Project/syrius-robotops/syrius-robotops/src/frontend/src/data/taskRegistry.ts) 新增：

- `DEPLOY_AE_CONFIG_DAG: DagDefinition`
- `DEPLOY_AE_CONFIG_ERROR_DAG: DagDefinition`
- 在 `TASK_REGISTRY.taskTypes` 数组追加：

```ts
{
  type: "deploy-ae-config",
  name: "Deploy AE Config",
  description: "Deploy an Applet Engine config package to /opt/cosmos/bin/applet-engine and reboot.",
  robotSelection: {
    mode: "multiple",
    description: "Select one or more target robots to deploy the AE config package.",
  },
  dag: DEPLOY_AE_CONFIG_DAG,
  expectedResults: ["reconnect_done"],
  errorDag: DEPLOY_AE_CONFIG_ERROR_DAG,
  params: {
    artifactId: { type: "artifact", label: "AE config package", required: true },
  },
}
```

CreateTaskModal 已根据 `params` 描述自动渲染制品选择器（`ArtifactSelector`），无需修改前端组件代码。

---

## 7. 失败与重试策略

| 阶段 | 失败原因 | 处理 |
|------|----------|------|
| transfer | 网络不可达、SSH 密码错误、磁盘空间不足、checksum 不匹配 | 由 `SshFileTransferTask` 自带的 `retryCount=3` 重试；最终失败抛错，触发 errorDag。 |
| deploy | unzip 失败、目录权限不足、cp 失败 | 抛错；triggers errorDag → DeleteAEConfigTask 执行清理。 |
| reboot | reboot 命令本身因连接断开而报错 | `RebootRobotTask` 已通过白名单识别为预期错误，视为成功。 |
| wait_reconnect | 6 分钟内未恢复 | 视为失败；errorDag 仍执行清理（此时机器人可能不在线，cleanup 也会失败但被记录）。 |

---

## 8. 安全与日志

- 任务实现内严禁 `console.*`，统一使用 `BaseTask.log`（Pino 子 logger）。
- 日志结构化字段示例：`{ artifactId, localFilePath, bytesTransferred }`，遵循 `CLAUDE.md` 第 2 节。
- SSH 密码不出现在日志中（`SshCommandTask` 已在命令字符串拼接处规避，仅用于 `sudo -S` 输入）。

---

## 9. 兼容性与回滚

- 不变更对象存储格式、SSE 协议、API 路径。
- 若需禁用本功能，仅需在 `taskRegistry.ts` 中移除 `deploy-ae-config` 条目，后端任务保留亦不影响其他流程。
