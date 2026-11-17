# 前端 DAG 定义与表达 — 技术说明

> 本文档说明前端如何定义和管理任务 DAG（Directed Acyclic Graph），包括数据结构和维护策略。

---

## 1. 概述

前端在创建用户任务时，需要根据任务类型（`taskType.type`）向任务流引擎提交对应的 DAG 配置。DAG 定义了任务的执行步骤、依赖关系和解析器映射，是前端与后端任务流引擎之间的核心协议。

本文档说明：
- DAG 的数据结构（TypeScript 类型定义）
- DAG 的集中维护方式
- 如何通过任务类型查找对应的 DAG 配置

---

## 2. 文件位置

| 文件 | 说明 |
|------|------|
| `src/frontend/src/data/taskRegistry.ts` | DAG 类型、任务类型与 DAG 的集中注册表 |
| `src/frontend/src/types/task.ts` | 任务相关类型与 registry 的向后兼容导出 |
| `src/frontend/src/hooks/useTasks.ts` | 调用方示例（通过 `getTaskTypeDefinition` 获取 DAG） |
| `src/frontend/src/api/taskApi.ts` | API 层（发送 DAG 到后端 `/flows` 接口） |

**核心模块**：`src/frontend/src/data/taskRegistry.ts`

---

## 3. 数据结构

### 3.1 类型定义

```typescript
export interface RobotSelection {
  mode: "single" | "multiple";
  description?: string;
}

export interface TaskParamDescriptor {
  type: "artifact" | "text" | "number" | "select" | "checkbox" | "multiselect";
  label: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  options?: string[];
}

export interface DagResolver {
  name: string;                        // 解析器名称，对应后端 ResolverRegistry 中的注册名
  params: Record<string, string | { value: unknown }>; // 变量引用或字面量
  results: Record<string, string>;     // 解析器输出到 DAG 变量的映射
}

export interface DagTaskNode {
  requires: string[];                  // 本任务依赖的前置变量（包括输入变量和上游任务提供）
  resolver: DagResolver;               // 执行本任务的解析器
  provides: string[];                  // 本任务完成后提供的变量
}

export interface DagDefinition {
  tasks: Record<string, DagTaskNode>;  // 任务名 → 任务节点
}

export interface TaskTypeDefinition {
  type: string;
  name: string;
  description: string;
  robotSelection: RobotSelection;
  dag: DagDefinition;                  // 主流程 DAG
  expectedResults: string[];           // 期望的最终结果变量名（用于判定流程成功）
  errorDag?: DagDefinition;            // 异常处理/回滚 DAG（可选）
  params: Record<string, TaskParamDescriptor>;
  manualDeviceIdInput?: boolean;
}
```

### 3.2 拓扑规则

1. **`requires`**：每个任务节点的 `requires` 列出其运行所需的全部变量。这些变量来自：
   - 创建任务时的 `input` 参数（如 `robotIp`, `robotPort`, `artifactId`）
   - 上游任务节点的 `provides` 输出
2. **`provides`**：任务完成后的输出变量，供下游任务在 `requires` 中引用。
3. **拓扑排序**：引擎根据 `requires`/`provides` 关系自动计算执行顺序。
4. **`expectedResults`**：流程所有依赖满足后，检查这些变量是否均被提供，以判定整体成功。

### 3.3 参数引用约定

`resolver.params` 的值是**变量名引用**（字符串），指向 `requires` 中的变量。引擎在执行时将变量值展开为实际参数。

示例：
```typescript
params: {
  robotIp: "robotIp",       // "robotIp" 指向 input 中的 robotIp 值
  robotPort: "robotPort",   // "robotPort" 指向 input 中的 robotPort 值
  artifactId: "artifactId", // "artifactId" 指向 input 中的 artifactId 值
}
```

---

## 4. DAG 映射表

所有任务类型的 DAG 配置集中维护在 `src/frontend/src/data/taskRegistry.ts` 的 `TASK_REGISTRY.taskTypes` 中。每个 `TaskTypeDefinition` 直接包含 `dag`、`expectedResults` 和可选的 `errorDag`：

```typescript
export const TASK_REGISTRY: TaskRegistry = {
  version: "1.0.0",
  taskTypes: [
    {
      type: "upgrade-movebase",
      name: "Upgrade Movebase",
      // 六步 DAG: transfer → upgrade → reboot → wait_reconnect → verify_version → cleanup
      dag: UPGRADE_MOVEBASE_DAG,
      errorDag: UPGRADE_MOVEBASE_ERROR_DAG,
      expectedResults: ["cleanup_done"],
      params: { artifactId: { /* ... */ }, expectedVersion: { /* ... */ } },
    },
    // ...
  ],
};
```

### 4.1 已有 DAG 配置

#### movebase-disk-cleanup（Alpha2 Movebase 升级后磁盘空间清理）

单步流程：

```
input variables ──→ [cleanup] ──→ cleanup_done
```
- 解析器：`MovebaseDiskCleanupTask`
- 输入依赖：`robotIp`, `robotPort`, `cleanUserHomes`
- 预期结果：`cleanup_done`
- `cleanUserHomes` 默认为 `false`，前端以复选框呈现；勾选后才清理 `/home/developer` 和 `/home/factory` 下用户生成文件。
- 任务不需要 Artifact 参数，任务创建向导的参数步骤只展示清理范围确认项。

#### apply-alpha2-map（应用 Alpha2 地图）

四步流程，含异常处理：

```
input variables ──→ [transfer] ──→ [apply] ──→ [delete_package] ──→ [wait (30s)] ──→ wait_done
                       │               │               │
                       └── transfer_done               │
                                       └── apply_done ──┘
                                                       └── delete_done
如果主流程任一任务失败：
[error_cleanup] ──→ error_cleanup_done
```
- 解析器：`TransferAlpha2MapTask`, `ApplyAlpha2MapTask`, `DeleteAlpha2MapTask`, `SleepTask`
- 输入依赖：`robotIp`, `robotPort`, `artifactId`
- 预期结果：`wait_done`
- `transfer` 节点将 Alpha2 地图压缩包传输到机器人 `/tmp/alpha2_map_package.zip`
- `apply` 节点执行五步操作：清除旧地图 (`rm -rf /opt/cosmos/map/ws/*`)、解压新地图 (`unzip -o`)、修正目录所有权 (`chown -R pivot:pivot`)、删除 SQLite 数据库文件 (`rm /opt/cosmos/map/sqlite/*`)、重启 marie 服务 (`systemctl restart marie.service`)
- `delete_package` 节点清理已传输的地图压缩包 (`rm -rf /tmp/alpha2_map_package.zip`)
- `wait` 节点等待 30 秒让 marie 检测并加载新地图 (marie 每 10 秒检查 `/opt/cosmos/map/ws/` 目录更新)
- 异常 DAG：清理残留地图包

#### upgrade-movebase（Alpha2 Movebase 升级）

六步流程，含异常处理：

```
input variables ──→ [transfer] ──→ [upgrade] ──→ [reboot] ──→ [verify_version] ──→ [cleanup] ──→ cleanup_done
                        │              │             │               │                       │
                        └── transfer_done ───────────┘               │                       │
                                       └── upgrade_done ────────────┘                       │
                                                      └── reboot_done ──────────────────────┘
                                                                      └── verify_done ──────┘
如果主流程任一任务失败：
[error_cleanup] ──→ error_cleanup_done
```
- 解析器：`TransferMovebaseTask`, `UpgradeMovebaseTask`, `RebootRobotTask`, `MatchMovebaseVersionTask`, `DeleteMovebaseTask`
- 输入依赖：`robotIp`, `robotPort`, `artifactId`, `expectedVersion`
- 预期结果：`cleanup_done`
- `transfer` 节点将 Alpha2 Movebase 离线包传输到机器人 `/mnt/sdcard/offlineota/alpha2_movebase_offline_package.zip`
- `upgrade` 节点解压离线包并执行包内 `install_offline.sh`
- 异常 DAG：清理残留安装包

#### upgrade-alpha19-movebase（Alpha1.9 Movebase 升级）

六步流程，与 `upgrade-movebase` 相同，仅传输与安装解析器不同：

```
input variables ──→ [transfer] ──→ [upgrade] ──→ [reboot] ──→ [wait_reconnect] ──→ [verify_version] ──→ [cleanup] ──→ cleanup_done
如果主流程任一任务失败：
[error_cleanup] ──→ error_cleanup_done
```
- 解析器：`TransferAlpha19MovebaseTask`, `UpgradeAlpha19MovebaseTask`, `RebootRobotTask`, `WaitSshReconnectTask`, `MatchMovebaseVersionTask`, `DeleteMovebaseTask`
- 输入依赖：`robotIp`, `robotPort`, `artifactId`, `expectedVersion`
- 预期结果：`cleanup_done`
- `transfer` 节点将 Alpha1.9 Movebase 离线包（约 856 MB）传输到机器人 `/mnt/sdcard/offlineota/alpha1_9_movebase_offline_package.zip`；传输超时默认 120 秒以覆盖大文件校验
- `upgrade` 节点清理旧解压目录、解压离线包，并通过 `bash` 执行包内 `install_offline.sh`；安装超时默认 30 分钟
- 离线包脚本无需修改即可运行，安装后 `/opt/cosmos/etc/ota/version` 写入 `5.3.2148`，供 `MatchMovebaseVersionTask` 校验
- 异常 DAG：`UPGRADE_MOVEBASE_ERROR_DAG`（清理残留安装包）

#### install-booster（安装最小系统 Booster）

两步流程：

```
input variables ──→ [transfer] ──→ [install] ──→ install_done
                        │              │
                        └── transfer_done ──┘
```
- 解析器：`TransferBoosterTask`, `InstallBoosterTask`
- 输入依赖：`robotIp`, `robotPort`, `artifactId`
- 预期结果：`install_done`
- `transfer` 节点将 Booster zip 包上传到机器人 `/tmp/booster.zip`（无需 sudo）
- `install` 节点执行三步操作：清理解压目录 (`rm -rf /tmp/ota`)、解压 (`unzip -o /tmp/booster.zip -d /tmp/ota`)、以 sudo 运行安装脚本（`sh -c 'cd /tmp/ota; ./install_booster.sh'`）
- 无异常 DAG：安装脚本由包内提供，失败时保留 `/tmp/ota` 便于现场排查

#### install-deb-package（安装 deb 包）

两步流程，含异常处理：

```
input variables ──→ [transfer] ──→ [install] ──→ install_done
                        │              │
                        └── transfer_done ──┘
如果主流程任一任务失败：
[error_cleanup] ──→ error_cleanup_done
```
- 解析器：`TransferDebPackageTask`, `InstallDebPackageTask`, `CleanupDebPackageTask`
- 输入依赖：`robotIp`, `robotPort`, `artifactId`
- 预期结果：`install_done`
- `transfer` 节点将 `.deb` 上传到机器人 `/tmp/install_deb_package.deb`；固定远程文件名不影响安装后的包名
- `install` 节点通过 `dpkg-deb -f` 解析包名，先执行 `apt-mark manual`，再执行 `dpkg -i --force-confold`，成功后补标记并清理临时文件
- `apt-mark` 失败可忽略；`dpkg -i` 失败使任务失败；配置文件冲突保留机器人现有配置
- 异常 DAG：`INSTALL_DEB_PACKAGE_ERROR_DAG`，用 `CleanupDebPackageTask` 删除临时 `.deb`

#### upgrade-bup（BUP 固件升级）

六步流程，含异常处理（upgrade 前先传输 upgrade_bup.sh 脚本，upgrade 后等待 SSH 断开并在 3 分钟内重连成功）：

```
input variables ──→ [transfer] ──→ [script_transfer] ──→ [upgrade] ──→ [wait_reconnect(180s)] ──→ [verify_version] ──→ [cleanup] ──→ cleanup_done
                       │                  │                       │                         │                         │                       │
                       └── transfer_done ─┘                       │                         │                         │                       │
                                          └── script_transfer_done┘                         │                         │                       │
                                                                                       └── upgrade_done ─────────────┘                         │
                                                                                                                              └── reconnect_done ───────┘                       │
                                                                                                                                                                      └── verify_done ──────┘
如果主流程任一任务失败：
[error_cleanup] ──→ error_cleanup_done
```
- 解析器：`TransferBUPTask`, `TransferBUPScriptTask`, `UpgradeBUPTask`, `WaitSshReconnectTask`, `MatchBUPVersionTask`, `DeleteBUPTask`
- 输入依赖：`robotIp`, `robotPort`, `artifactId`, `expectedVersion`
- 预期结果：`cleanup_done`
- 异常 DAG：清理残留安装包
- `script_transfer` 节点将 `res/upgrade_bup.sh` 传输到机器人的 `/tmp/upgrade_bup.sh`，供后续 UpgradeBUPTask 使用
- `wait_reconnect` 参数：`timeout: 180000`（等待 SSH 先断开再重连成功，单位 ms）

---

## 5. 调用方式

其他模块通过 `getTaskTypeDefinition(taskType)` 函数查询任务类型及其 DAG：

```typescript
import { getTaskTypeDefinition } from "../data/taskRegistry.js";

const definition = getTaskTypeDefinition(taskType.type);
if (!definition) throw new Error(`Unknown task type: ${taskType.type}`);
// definition.dag            → DagDefinition (主流程)
// definition.expectedResults → string[] (期望结果)
// definition.errorDag       → DagDefinition | undefined (异常处理)
```

每个 DAG 配置定义的是**单机器人**的执行流程（如 transfer → upgrade → cleanup）。当用户选择 N 个机器人时，前端依次为每个机器人创建独立的 taskFlow，每个 taskFlow 携带该机器人专属的 `robotIp`/`robotPort`。N 个机器人 → N 个 taskFlow → N 条任务记录。

未注册的任务类型会抛出 `Unknown task type`，不会静默回退到默认 DAG。

---

## 6. 新增任务类型的步骤

1. 在 `src/frontend/src/data/taskRegistry.ts` 中定义该类型的 `DagDefinition` 常量（和可选的 `errorDag`）
2. 在 `TASK_REGISTRY.taskTypes` 中添加对应条目，包含 `type`、`name`、`robotSelection`、`dag`、`expectedResults`、`errorDag` 和 `params`
3. 在 `src/backend/src/tasks/real/` 与 `src/backend/src/tasks/mock/` 中实现 resolver
4. 在 `src/backend/src/tasks/index.ts` 导出，并在 `src/backend/src/index.ts` 的 `registerTasks` 中注册 real/mock
5. 更新需求、设计、测试用例和 E2E 测试；如需特殊 UI，在对应组件中按 `taskType.type` 差异化渲染

---

## 7. 设计原则

- **单一数据源**：所有 DAG 定义集中在 `taskRegistry.ts`，不分散在 hook 或组件中
- **类型安全**：使用 TypeScript 接口约束 DAG 结构，编译期即可发现格式错误
- **可扩展**：新增任务类型只需在 registry 中添加条目，并注册对应后端 resolver，无需修改调用方代码
- **与后端对齐**：DAG 结构直接映射到任务流引擎的 FlowRecord 格式，前后端使用同一套命名约定
