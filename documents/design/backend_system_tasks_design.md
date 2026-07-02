# 后端系统维护任务 — 技术设计文档

> 本文档依据《后端系统维护任务需求规格说明书》编写，描述 SyncTimeTask、UninstallL4TDownloaderTask、FixBrokenPackagesTask 三个任务的技术实现。

---

## 1. SyncTimeTask

### 1.1 概述

获取 PC 当前系统时间并通过 SSH 在机器人上执行 `date -s` 命令设置时间，同时尝试写入硬件时钟。

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

PC 时间在任务执行时获取，拼入命令字符串：

```
date -s "YYYY-MM-DD HH:MM:SS" && hwclock --systohc && timedatectl set-local-rtc 0 && timedatectl set-local-rtc 1
```

- `date -s "<time>"` — 设置系统时间
- `hwclock --systohc` — 将系统时间写入硬件时钟
- `timedatectl set-local-rtc 0` — 设置 RTC 为 UTC 模式
- `timedatectl set-local-rtc 1` — 设置 RTC 为本地时间模式（触发重新读取）

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
- 时间格式使用本地时区（`new Date().toLocaleString()` 或自行格式化）
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
| `commandTimeout` | `number` | `120000` | 命令超时(ms，2分钟) |

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

## 4. DAG 定义

三个原子任务为单步 DAG（仅一个任务节点），无需 errorDag。Fix Alpha1.9 OTA 为七步组合 DAG。

### 4.1 Sync Time DAG

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

### 4.2 Uninstall L4TDownloader DAG

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

### 4.3 Fix Broken Packages DAG

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

### 4.4 Fix Alpha1.9 OTA Environment DAG

七步组合 DAG，复用现有任务解析器：

```
detect_reboot → transfer → install → fix → sync_time → uninstall_l4t → reboot
```

| 步骤 | 任务解析器 | 说明 |
|------|-----------|------|
| `detect_reboot` | `WaitSshReconnectTask` | 等待手动重启并重连（超时 600s） |
| `transfer` | `TransferDragonball3Task` | 上传 dragonball3 `.deb` |
| `install` | `InstallDragonball3Task` | 安装固件 |
| `fix` | `FixBrokenPackagesTask` | 修复破损安装包 |
| `sync_time` | `SyncTimeTask` | 同步系统时间 |
| `uninstall_l4t` | `UninstallL4TDownloaderTask` | 卸载 l4t-downloader |
| `reboot` | `RebootRobotTask` | 重启使变更生效 |

Error DAG 复用 `INSTALL_DRAGONBALL3_ERROR_DAG` (`DeleteDragonball3Task`)。

---

## 5. 前端任务类型注册

| 属性 | Sync Time | Uninstall L4T | Fix Broken Pkgs | Fix Alpha1.9 OTA |
|------|-----------|-------------|-----------------|-------------------|
| `type` | `sync-time` | `uninstall-l4t-downloader` | `fix-broken-packages` | `fix-alpha19-ota` |
| `name` | `Sync Time` | `Uninstall L4TDownloader` | `Fix Broken Packages` | `Fix Alpha1.9 OTA Environment` |
| `robotSelection.mode` | `multiple` | `multiple` | `multiple` | `multiple` |
| `params` | `{}` | `{}` | `{}` | `{ artifactId }` |
| `errorDag` | — | — | — | `INSTALL_DRAGONBALL3_ERROR_DAG` |

---

## 6. 文件清单

| 文件 | 说明 |
|------|------|
| `src/backend/src/tasks/real/syncTimeTask.ts` | SyncTimeTask 实现 |
| `src/backend/src/tasks/mock/mockSyncTimeTask.ts` | MockSyncTimeTask |
| `src/backend/src/tasks/real/uninstallL4TDownloaderTask.ts` | UninstallL4TDownloaderTask 实现 |
| `src/backend/src/tasks/mock/mockUninstallL4TDownloaderTask.ts` | MockUninstallL4TDownloaderTask |
| `src/backend/src/tasks/real/fixBrokenPackagesTask.ts` | FixBrokenPackagesTask 实现 |
| `src/backend/src/tasks/mock/mockFixBrokenPackagesTask.ts` | MockFixBrokenPackagesTask |
| `src/backend/src/tasks/index.ts` | 导出注册 |
| `src/backend/src/index.ts` | 任务注册 |
| `src/frontend/src/data/taskRegistry.ts` | 前端 DAG + 任务类型定义 |
