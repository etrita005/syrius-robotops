# 后端系统维护任务 — 需求规格说明书

## 1. 概述

本需求定义了三个原子系统维护任务及一个组合修复任务，用于 RobotOps Studio 对目标机器人执行时间同步、软件包清理、破损安装包修复及 Alpha1.9 OTA 环境整体修复操作。

**关键场景**：
- FAE 需要将机器人时间同步为 PC 当前时间
- 清理机器人上残留的 l4t-downloader 包
- 修复机器人上因异常中断而残留的未完成安装包
- 一键修复 Alpha1.9 机器人的完整 OTA 环境

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **同步时间（Sync Time）** | 获取 PC 系统当前时间，通过 SSH 在机器人上执行 `date` 命令设置 |
| **L4TDownloader** | Jetson L4T 系统下载器工具包（`l4t-downloader`），通过 dpkg 管理 |
| **破损安装包（Broken Packages）** | dpkg/apt 因中断或锁冲突而残留的未完成安装任务 |
| **修复 Alpha1.9 OTA 环境（Fix Alpha1.9 OTA Environment）** | 组合任务：依次执行修复破损包、等待用户手动重启、安装 dragonball3 固件、同步时间、卸载 l4t-downloader、重启 |

---

## 3. 任务一：同步时间（SyncTimeTask）

### FR-SYNC-01: 任务目标

将机器人系统时间同步为当前 PC 系统时间。

### FR-SYNC-02: 时间获取

- 在任务执行时获取宿主 PC 系统当前时间
- 时间格式：`YYYY-MM-DD HH:MM:SS`（用于 `date -s` 命令参数）

### FR-SYNC-03: 时间设置命令

- 通过 SSH 在机器人上执行时间同步命令组合：
  - `date -s "<formatted_time>"` — 设置系统时间
  - `hwclock --systohc` — 写入硬件时钟
  - `timedatectl set-local-rtc 0` → `timedatectl set-local-rtc 1` — 切换 RTC 模式以触发重新读取
- 所有命令需要 sudo 权限

### FR-SYNC-04: 参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `robotIp` | `string` | 是 | — | 目标机器人 IP |
| `robotPort` | `number` | 否 | `22` | SSH 端口 |
| `commandTimeout` | `number` | 否 | `10000` | 命令超时(ms) |

### FR-SYNC-05: 输出

| 字段 | 类型 | 说明 |
|------|------|------|
| `done` | `true` | 完成标记 |
| `success` | `true` | 成功标记 |
| `syncedTime` | `string` | 已设置的时间字符串 |
| `stdout` | `string` | SSH 命令标准输出 |
| `stderr` | `string` | SSH 命令标准错误 |
| `exitCode` | `number \| null` | 命令退出码 |

---

## 4. 任务二：卸载 L4TDownloader（UninstallL4TDownloaderTask）

### FR-UNINST-01: 任务目标

在目标机器人上彻底卸载 `l4t-downloader` 包及其残留文件。

### FR-UNINST-02: 卸载流程

- `dpkg --purge l4t-downloader` — 完全移除（包括配置文件）
- 命令使用 sudo 权限执行

### FR-UNINST-03: 清理内容

- 移除 l4t-downloader 软件包本体
- 移除其配置文件（purge）
- 清理可能存在的依赖残留

### FR-UNINST-04: 参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `robotIp` | `string` | 是 | — | 目标机器人 IP |
| `robotPort` | `number` | 否 | `22` | SSH 端口 |
| `commandTimeout` | `number` | 否 | `60000` | 命令超时(ms) |

### FR-UNINST-05: 输出

| 字段 | 类型 | 说明 |
|------|------|------|
| `done` | `true` | 完成标记 |
| `success` | `true` | 成功标记 |
| `stdout` | `string` | SSH 命令标准输出 |
| `stderr` | `string` | SSH 命令标准错误 |
| `exitCode` | `number \| null` | 命令退出码 |

---

## 5. 任务三：修复未完成安装包（FixBrokenPackagesTask）

### FR-FIX-01: 任务目标

修复机器人上因异常中断导致的 dpkg/apt 破损安装状态。

### FR-FIX-02: 修复命令

单条组合命令（sudo 执行）：

```
dpkg --configure -a && rm -f /var/lib/dpkg/lock* && DEBIAN_FRONTEND=noninteractive apt -o Dpkg::Options::=--force-overwrite -o Dir::Etc=/opt/cosmos/var/cosmos_update_engine/apt --allow-downgrades --fix-broken install -y
```

各步骤说明：
1. `dpkg --configure -a` — 完成所有未配置的包
2. `rm -f /var/lib/dpkg/lock*` — 清理 dpkg 锁文件
3. `apt --fix-broken install -y` — 修复破损依赖，使用 cosmos update engine 的 apt 配置目录

### FR-FIX-03: 参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `robotIp` | `string` | 是 | — | 目标机器人 IP |
| `robotPort` | `number` | 否 | `22` | SSH 端口 |
| `commandTimeout` | `number` | 否 | `120000` | 命令超时(ms，2分钟) |

### FR-FIX-04: 输出

| 字段 | 类型 | 说明 |
|------|------|------|
| `done` | `true` | 完成标记 |
| `success` | `true` | 成功标记 |
| `stdout` | `string` | SSH 命令标准输出 |
| `stderr` | `string` | SSH 命令标准错误 |
| `exitCode` | `number \| null` | 命令退出码 |

---

## 6. 任务四：修复 Alpha1.9 OTA 环境（Fix Alpha1.9 OTA Environment）

### FR-ALPHA19-01: 任务目标

一键修复 Alpha1.9 机器人的完整 OTA 环境，组合执行：修复破损包 → 等待手动重启 → 传输/安装 dragonball3 固件 → 同步时间 → 卸载 l4t-downloader → 重启。

### FR-ALPHA19-02: 执行流程

| 步骤 | 任务 | 说明 |
|------|------|------|
| 1 | `FixBrokenPackagesTask` | 修复未完成安装包 |
| 2 | `WaitSshReconnectTask` | 等待用户手动重启机器人并重连 |
| 3 | `TransferDragonball3Task` | 上传 dragonball3 `.deb` 固件 |
| 4 | `InstallDragonball3Task` | 安装固件 |
| 5 | `SyncTimeTask` | 同步 PC 时间到机器人 |
| 6 | `UninstallL4TDownloaderTask` | 卸载 l4t-downloader |
| 7 | `RebootRobotTask` | 重启机器人使所有变更生效 |

### FR-ALPHA19-03: 异常处理

- 错误处理 DAG 复用 `install-dragonball3` 的 errorDag，在失败时执行 `DeleteDragonball3Task` 清理残留文件

### FR-ALPHA19-04: 参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `artifactId` | `artifact` | 是 | dragonball3 固件 `.deb` 包 |
| `robotIp` | `string` | 是 | 目标机器人 IP |
| `robotPort` | `number` | 否 | SSH 端口（默认 22） |

### FR-ALPHA19-05: 前端

| 属性 | 值 |
|------|-----|
| `type` | `fix-alpha19-ota` |
| `name` | `Fix Alpha1.9 OTA Environment` |
| `robotSelection.mode` | `multiple` |

---

## 7. 非功能需求

### NFR-01: 代码规范
- TypeScript + ES6 模块语法
- 所有任务继承 `SshCommandTask`
- 日志使用 Pino（`this.log`），禁止 `console.log`

### NFR-02: Mock 模式
- 在 `--mock` 模式下，所有原子任务均应提供 Mock 实现
- Fix Alpha1.9 OTA 为组合任务，其 Mock 模式通过组合现有 Mock 任务实现
- Mock 变体不实际连接机器人，返回模拟成功结果

### NFR-03: 错误处理
- SSH 连接失败 → 重试后抛出最后错误
- 命令执行失败（exitCode != 0）→ 抛出包含 stdout/stderr 的错误
- 继承 `BaseTask` 的 `ignoreFailure` 转义机制
