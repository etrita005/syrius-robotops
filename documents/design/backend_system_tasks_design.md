# 后端系统维护任务 — 技术设计文档

> 本文档依据《后端系统维护任务需求规格说明书》编写，描述 SyncTimeTask、UninstallL4TDownloaderTask、FixBrokenPackagesTask、Install Deb Package 等系统维护任务的技术实现。

---

## 1. SyncTimeTask

### 1.1 概述

获取 PC 当前系统时间（UTC）并通过 SSH 在机器人上执行 `date -s` 命令设置系统时间，同时写入硬件时钟。机器人时区保持不变。

### 1.2 类继承

```
BaseTask → SshCommandTask → SyncTimeTask
```

### 1.3 输入参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `robotIp` | `string` | (required) | 目标机器人 IP |
| `robotPort` | `number` | `22` | SSH 端口 |
| `commandTimeout` | `number` | `10000` | 命令超时(ms) |

继承自 `SshCommandTask` 的其他参数。`sudo` 强制为 `true`，`retryCount` 强制为 `1`。

### 1.4 SSH 命令

PC 时间在任务执行时获取（UTC），拼入命令字符串：

```
date -s "YYYY-MM-DD HH:MM:SS UTC" && hwclock --systohc && timedatectl set-local-rtc 0 && timedatectl set-local-rtc 1
```

- `date -s "<time> UTC"` — 设置系统时间（time 为 UTC 时间串，UTC 后缀使 `date` 按 UTC 解析，与机器人时区无关）
- `hwclock --systohc` — 将系统时间写入硬件时钟
- `timedatectl set-local-rtc 0` — 设置 RTC 为 UTC 模式
- `timedatectl set-local-rtc 1` — 切换 RTC 为本地时间模式（触发重新读取）

### 1.5 输出参数

| 字段 | 类型 | 说明 |
|------|------|------|
| `done` | `true` | 完成标记 |
| `success` | `true` | 成功标记 |
| `syncedTime` | `string` | 已设置的时间字符串 |
| `stdout` | `string` | 命令标准输出 |
| `stderr` | `string` | 命令标准错误 |
| `exitCode` | `number \| null` | 退出码 |

### 1.6 实现要点

- 在 `onExec` 中先获取当前时间，拼入命令后调用 `super.onExec`
- 时间格式使用 UTC（`Date.getUTC*` 系列方法），确保时间串为 UTC 值
- `date -s` 使用 UTC 后缀，使解析与机器人时区无关，无需修改机器人时区
- Mock 变体返回模拟的 `syncedTime`

---

## 2. UninstallL4TDownloaderTask

### 2.1 概述

通过 dpkg 彻底卸载 `l4t-downloader` 包：先停止 update-engine 服务、清理锁文件，然后 purge 移除包及配置文件。

### 2.2 类继承

```
BaseTask → SshCommandTask → UninstallL4TDownloaderTask
```

### 2.3 输入参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `robotIp` | `string` | (required) | 目标机器人 IP |
| `robotPort` | `number` | `22` | SSH 端口 |
| `commandTimeout` | `number` | `60000` | 命令超时(ms) |

继承自 `SshCommandTask` 的其他参数。`sudo` 强制为 `true`，`retryCount` 强制为 `1`。

### 2.4 SSH 命令

```
systemctl stop cosmos-update-engine.service || true && sleep 3 && rm -f /var/lib/dpkg/lock* && dpkg --purge l4t-downloader
```

- `systemctl stop cosmos-update-engine.service || true` — 停止可能占用 dpkg 的 update-engine 服务
- `sleep 3` — 等待服务完全停止
- `rm -f /var/lib/dpkg/lock*` — 清理可能残留的 dpkg 锁文件
- `dpkg --purge l4t-downloader` — 完全移除包及配置文件

### 2.5 输出参数

与 `SshCommandTask` 相同：`done`、`success`、`stdout`、`stderr`、`exitCode`。

### 2.6 实现要点

- `retryCount` 强制为 `1`，因为卸载是幂等的且重复执行无意义
- Mock 变体返回模拟成功结果

---

## 3. FixBrokenPackagesTask

### 3.1 概述

在机器人上先停止 update-engine 服务、清理锁文件，然后执行 `dpkg --configure -a`、通过 cosmos update engine apt 配置执行 `--fix-broken install`。

### 3.2 类继承

```
BaseTask → SshCommandTask → FixBrokenPackagesTask
```

### 3.3 输入参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `robotIp` | `string` | (required) | 目标机器人 IP |
| `robotPort` | `number` | `22` | SSH 端口 |
| `commandTimeout` | `number` | `1800000` | 命令超时(ms，30分钟) |

继承自 `SshCommandTask` 的其他参数。`sudo` 强制为 `true`，`retryCount` 强制为 `1`。

### 3.4 SSH 命令

```
systemctl stop cosmos-update-engine.service || true && sleep 3 && rm -f /var/lib/dpkg/lock* && dpkg --configure -a && DEBIAN_FRONTEND=noninteractive apt -o Dpkg::Options::=--force-overwrite -o Dir::Etc=/opt/cosmos/var/cosmos_update_engine/apt --allow-downgrades --fix-broken install -y
```

- `systemctl stop cosmos-update-engine.service || true` — 停止可能占用 dpkg 的 update-engine 服务
- `sleep 3` — 等待服务完全停止
- `rm -f /var/lib/dpkg/lock*` — 清理可能残留的 dpkg 锁文件
- `dpkg --configure -a` — 完成未配置的包
- `apt --fix-broken install -y` — 修复破损依赖

### 3.5 输出参数

与 `SshCommandTask` 相同：`done`、`success`、`stdout`、`stderr`、`exitCode`。

### 3.6 实现要点

- `retryCount` 强制为 `1`，避免重复执行 dpkg 操作
- 命令中包含环境变量 `DEBIAN_FRONTEND=noninteractive` 以保证非交互式运行
- Mock 变体返回模拟成功结果

---

## 4. Install Deb Package

### 4.1 概述

安装 deb 包由三个 resolver 组成：

- `TransferDebPackageTask`：上传 artifact 到 `/tmp/install_deb_package.deb`。
- `InstallDebPackageTask`：解析包名，执行 `apt-mark manual` 和 `dpkg -i --force-confold`，成功后补标记并清理临时文件。
- `CleanupDebPackageTask`：errorDag 中删除 `/tmp/install_deb_package.deb`。

远程临时文件名固定，不保留原始 artifact 文件名。安装后的包名由 `.deb` 的 `Package` 控制字段决定，重命名文件不会改变实际安装的软件名称。

### 4.2 类继承

```
BaseTask → SshFileTransferTask → TransferDebPackageTask
BaseTask → SshCommandTask → InstallDebPackageTask
BaseTask → SshCommandTask → CleanupDebPackageTask
```

### 4.3 TransferDebPackageTask

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `artifactId` | `string` | (optional) | 待上传的 `.deb` artifact |
| `timeout` | `number` | `120000` | SSH/校验超时(ms)，覆盖较大 `.deb` 的 sha256 耗时 |

- 继承 `SshFileTransferTask`，`sudo` 强制为 `false`。
- `remoteFilePath` 固定为 `/tmp/install_deb_package.deb`。
- 通过 `artifactService.getArtifactPath(artifactId)` 解析本地路径，并记录 `artifactId` / `localFilePath` 日志。
- 不使用 `sudo: true`，避免父类在 `/tmp` 上执行 `chown -R developer:developer /tmp`。

### 4.4 InstallDebPackageTask

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `commandTimeout` | `number` | `300000` | 安装命令超时(ms) |

- 继承 `SshCommandTask`，`sudo` 强制为 `true`，`retryCount` 强制为 `1`。
- 安装命令：

```sh
PACKAGE_NAME=$(dpkg-deb -f /tmp/install_deb_package.deb Package) || exit 1
apt-mark manual "$PACKAGE_NAME" || true
DEBIAN_FRONTEND=noninteractive dpkg -i --force-confold /tmp/install_deb_package.deb
INSTALL_RC=$?
if [ "$INSTALL_RC" -eq 0 ]; then apt-mark manual "$PACKAGE_NAME" || true; fi
rm -f /tmp/install_deb_package.deb
exit "$INSTALL_RC"
```

- 整段包装在 `sh -c '...'` 中，由 `SshCommandTask` 统一加一次 sudo。
- 脚本内部不能出现 `&&`：`SshCommandTask` 会按 `&&` 拆分命令并逐段加 sudo，且变量不能跨段保留。
- `apt-mark` 失败可忽略；`dpkg -i` 失败不可忽略；`rm -f` 失败不覆盖 dpkg 退出码。
- `--force-confold` 保留机器人现有配置文件，避免 SSH 非交互场景阻塞。
- 不停止 `cosmos-update-engine`，不删除 dpkg 锁，不重启机器人。

### 4.5 CleanupDebPackageTask

- 继承 `SshCommandTask`，`sudo` 强制为 `true`，`retryCount` 强制为 `1`。
- 命令：`rm -f /tmp/install_deb_package.deb`。
- 幂等，可在 transfer 失败或 install 失败后的 errorDag 中执行。

---

## 5. DAG 定义

Sync Time、Uninstall L4TDownloader、Fix Broken Packages 为单步 DAG。Install Deb Package 为 transfer → install 两步 DAG，并带 errorDag。Fix Alpha1.9 OTA 为九步组合 DAG。

### 5.1 Sync Time DAG

```typescript
const SYNC_TIME_DAG: DagDefinition = {
  tasks: {
    sync: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "SyncTimeTask",
        params: { robotIp: "robotIp", robotPort: "robotPort" },
        results: { done: "sync_done" },
      },
      provides: ["sync_done"],
    },
  },
};
```

### 5.2 Uninstall L4TDownloader DAG

```typescript
const UNINSTALL_L4T_DOWNLOADER_DAG: DagDefinition = {
  tasks: {
    uninstall: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "UninstallL4TDownloaderTask",
        params: { robotIp: "robotIp", robotPort: "robotPort" },
        results: { done: "uninstall_done" },
      },
      provides: ["uninstall_done"],
    },
  },
};
```

### 5.3 Fix Broken Packages DAG

```typescript
const FIX_BROKEN_PACKAGES_DAG: DagDefinition = {
  tasks: {
    fix: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "FixBrokenPackagesTask",
        params: { robotIp: "robotIp", robotPort: "robotPort" },
        results: { done: "fix_done" },
      },
      provides: ["fix_done"],
    },
  },
};
```

### 5.4 Fix Alpha1.9 OTA Environment DAG

九步组合 DAG，复用现有任务解析器：

```
detect_reboot → transfer → install → transfer_iot_config → update_iot_config → fix → sync_time → uninstall_l4t → reboot
```

| 步骤 | 任务解析器 | 说明 |
|------|-----------|------|
| `detect_reboot` | `WaitSshReconnectTask` | 等待手动重启并重连（超时 600s） |
| `transfer` | `TransferDragonball3Task` | 上传 dragonball3 `.deb` |
| `install` | `InstallDragonball3Task` | 安装固件 |
| `transfer_iot_config` | `TransferIotGatewayConfigTask` | 传输 iot-gateway 配置 |
| `update_iot_config` | `UpdateIotGatewayConfigTask` | 更新 iot-gateway 配置（复用 `update-iot-gateway-config` DAG 中除 `reboot` 外的步骤，不执行重启） |
| `fix` | `FixBrokenPackagesTask` | 修复破损安装包 |
| `sync_time` | `SyncTimeTask` | 同步系统时间 |
| `uninstall_l4t` | `UninstallL4TDownloaderTask` | 卸载 l4t-downloader |
| `reboot` | `RebootRobotTask` | 重启使变更生效 |

Error DAG 复用 `INSTALL_DRAGONBALL3_ERROR_DAG` (`DeleteDragonball3Task`)。

### 5.5 Install Deb Package DAG

两步流程，含 errorDag：

```typescript
const INSTALL_DEB_PACKAGE_DAG: DagDefinition = {
  tasks: {
    transfer: {
      requires: ["robotIp", "robotPort", "artifactId"],
      resolver: {
        name: "TransferDebPackageTask",
        params: { robotIp: "robotIp", robotPort: "robotPort", artifactId: "artifactId" },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    install: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "InstallDebPackageTask",
        params: { robotIp: "robotIp", robotPort: "robotPort" },
        results: { done: "install_done" },
      },
      provides: ["install_done"],
    },
  },
};
```

Error DAG：

```typescript
const INSTALL_DEB_PACKAGE_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "CleanupDebPackageTask",
        params: { robotIp: "robotIp", robotPort: "robotPort" },
        results: { done: "error_cleanup_done" },
      },
      provides: ["error_cleanup_done"],
    },
  },
};
```

- `transfer` 上传 artifact 到 `/tmp/install_deb_package.deb`。
- `install` 自动解析包名，执行 `apt-mark manual`、`dpkg -i --force-confold`，成功后补标记并清理。
- `error_cleanup` 删除临时 `.deb`，幂等。

---

## 6. 前端任务类型注册

| 属性 | Sync Time | Uninstall L4T | Fix Broken Pkgs | Install Deb Package | Fix Alpha1.9 OTA |
|------|-----------|-------------|-----------------|---------------------|-------------------|
| `type` | `sync-time` | `uninstall-l4t-downloader` | `fix-broken-packages` | `install-deb-package` | `fix-alpha19-ota` |
| `name` | `Sync Time` | `Uninstall L4TDownloader` | `Fix Broken Packages` | `Install Deb Package` | `Fix Alpha1.9 OTA Environment` |
| `robotSelection.mode` | `multiple` | `multiple` | `multiple` | `multiple` | `multiple` |
| `params` | `{}` | `{}` | `{}` | `{ artifactId }` | `{ artifactId }` |
| `errorDag` | — | — | — | `INSTALL_DEB_PACKAGE_ERROR_DAG` | `INSTALL_DRAGONBALL3_ERROR_DAG` |

---

## 7. 文件清单

| 文件 | 说明 |
|------|------|
| `src/backend/src/tasks/real/syncTimeTask.ts` | SyncTimeTask 实现 |
| `src/backend/src/tasks/mock/mockSyncTimeTask.ts` | MockSyncTimeTask |
| `src/backend/src/tasks/real/uninstallL4TDownloaderTask.ts` | UninstallL4TDownloaderTask 实现 |
| `src/backend/src/tasks/mock/mockUninstallL4TDownloaderTask.ts` | MockUninstallL4TDownloaderTask |
| `src/backend/src/tasks/real/fixBrokenPackagesTask.ts` | FixBrokenPackagesTask 实现 |
| `src/backend/src/tasks/mock/mockFixBrokenPackagesTask.ts` | MockFixBrokenPackagesTask |
| `src/backend/src/tasks/real/transferDebPackageTask.ts` | TransferDebPackageTask 实现 |
| `src/backend/src/tasks/mock/mockTransferDebPackageTask.ts` | MockTransferDebPackageTask |
| `src/backend/src/tasks/real/installDebPackageTask.ts` | InstallDebPackageTask 实现 |
| `src/backend/src/tasks/mock/mockInstallDebPackageTask.ts` | MockInstallDebPackageTask |
| `src/backend/src/tasks/real/cleanupDebPackageTask.ts` | CleanupDebPackageTask 实现 |
| `src/backend/src/tasks/mock/mockCleanupDebPackageTask.ts` | MockCleanupDebPackageTask |
| `src/backend/src/tasks/index.ts` | 导出注册 |
| `src/backend/src/index.ts` | 任务注册 |
| `src/frontend/src/data/taskRegistry.ts` | 前端 DAG + 任务类型定义 |
