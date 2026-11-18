# 后端系统维护任务 — 需求规格说明书

## 1. 概述

本需求定义了系统维护任务，用于 RobotOps Studio 对目标机器人执行时间同步、软件包清理、破损安装包修复、deb 包安装及 Alpha1.9 OTA 环境整体修复操作。

**关键场景**：
- FAE 需要将机器人时间同步为 PC 当前时间
- 清理机器人上残留的 l4t-downloader 包
- 修复机器人上因异常中断而残留的未完成安装包
- 在机器人上安装或升级本地 `.deb` 包，并确保包被标记为手动安装
- 一键修复 Alpha1.9 机器人的完整 OTA 环境

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **同步时间（Sync Time）** | 获取 PC 系统当前时间，通过 SSH 在机器人上执行 `date` 命令设置 |
| **L4TDownloader** | Jetson L4T 系统下载器工具包（`l4t-downloader`），通过 dpkg 管理 |
| **破损安装包（Broken Packages）** | dpkg/apt 因中断或锁冲突而残留的未完成安装任务 |
| **修复 Alpha1.9 OTA 环境（Fix Alpha1.9 OTA Environment）** | 组合任务：依次执行修复破损包、等待用户手动重启、安装 dragonball3 固件、更新 iot-gateway 配置（不含重启）、同步时间、卸载 l4t-downloader、重启 |
| **安装 deb 包（Install Deb Package）** | 上传本地 `.deb` artifact 到机器人，自动解析 Debian 包名，执行 `apt-mark manual` 后使用 `dpkg -i` 安装或升级 |

---

## 3. 任务一：同步时间（SyncTimeTask）

### FR-SYNC-01: 任务目标

将机器人系统时间同步为当前 PC 系统时间（UTC）。机器人时区保持不变。

### FR-SYNC-02: 时间获取

- 在任务执行时获取宿主 PC 系统当前时间
- 时间使用 UTC（`Date.getUTC*` 系列方法），格式：`YYYY-MM-DD HH:MM:SS`（用于 `date -s` 命令参数）

### FR-SYNC-03: 时间设置命令

- 通过 SSH 在机器人上执行时间同步命令组合：
  - `date -s "<formatted_time> UTC"` — 设置系统时间（formatted_time 为 UTC 时间串，UTC 后缀使 `date` 按 UTC 解析，与机器人时区无关）
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

1. `systemctl stop cosmos-update-engine.service || true` — 停止可能占用 dpkg 的 update-engine 服务
2. `sleep 3` — 等待服务完全停止
3. `rm -f /var/lib/dpkg/lock*` — 清理可能残留的 dpkg 锁文件
4. `dpkg --purge l4t-downloader` — 完全移除（包括配置文件）
5. 命令使用 sudo 权限执行

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
systemctl stop cosmos-update-engine.service || true && sleep 3 && rm -f /var/lib/dpkg/lock* && dpkg --configure -a && DEBIAN_FRONTEND=noninteractive apt -o Dpkg::Options::=--force-overwrite -o Dir::Etc=/opt/cosmos/var/cosmos_update_engine/apt --allow-downgrades --fix-broken install -y
```

各步骤说明：
1. `systemctl stop cosmos-update-engine.service || true` — 停止可能占用 dpkg 的 update-engine 服务
2. `sleep 3` — 等待服务完全停止
3. `rm -f /var/lib/dpkg/lock*` — 清理可能残留的 dpkg 锁文件
4. `dpkg --configure -a` — 完成所有未配置的包
5. `apt --fix-broken install -y` — 修复破损依赖，使用 cosmos update engine 的 apt 配置目录

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

一键修复 Alpha1.9 机器人的完整 OTA 环境，组合执行：修复破损包 → 等待手动重启 → 传输/安装 dragonball3 固件 → 更新 iot-gateway 配置（不含重启） → 同步时间 → 卸载 l4t-downloader → 重启。

### FR-ALPHA19-02: 执行流程

| 步骤 | 任务 | 说明 |
|------|------|------|
| 1 | `WaitSshReconnectTask` | 等待用户手动重启机器人并重连 |
| 2 | `TransferDragonball3Task` | 上传 dragonball3 `.deb` 固件 |
| 3 | `InstallDragonball3Task` | 安装固件 |
| 4 | `TransferIotGatewayConfigTask` | 传输 iot-gateway 配置 |
| 5 | `UpdateIotGatewayConfigTask` | 更新 iot-gateway 配置（不执行重启，复用 `update-iot-gateway-config` 任务中除重启外的步骤） |
| 6 | `FixBrokenPackagesTask` | 修复未完成安装包 |
| 7 | `SyncTimeTask` | 同步 PC 时间到机器人 |
| 8 | `UninstallL4TDownloaderTask` | 卸载 l4t-downloader |
| 9 | `RebootRobotTask` | 重启机器人使所有变更生效 |

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

## 7. 任务五：安装 deb 包（Install Deb Package）

### FR-DEB-01: 任务目标

在目标机器人上安装或升级本地 `.deb` 包，并确保安装后的包被标记为手动安装，避免被 apt 自动清理。

### FR-DEB-02: 执行流程

| 步骤 | 任务 | 说明 |
|------|------|------|
| 1 | `TransferDebPackageTask` | 将 `.deb` artifact 上传到机器人 `/tmp/install_deb_package.deb` |
| 2 | `InstallDebPackageTask` | 解析包名，执行 `apt-mark manual` 和 `dpkg -i`，成功后补标记并清理临时文件 |
| 错误处理 | `CleanupDebPackageTask` | errorDag 中删除 `/tmp/install_deb_package.deb`，幂等执行 |

### FR-DEB-03: 包名解析

- 包名不从文件名推断，而是从 `.deb` 控制字段读取：
  - `PACKAGE_NAME=$(dpkg-deb -f /tmp/install_deb_package.deb Package)`
- 远程固定文件名为 `/tmp/install_deb_package.deb`；该文件名不影响安装后的包名、安装路径或 dpkg 数据库记录。
- `dpkg-deb` 读取失败时任务失败。

### FR-DEB-04: 安装命令

单条 `sh -c` 脚本（sudo 执行）：

```sh
PACKAGE_NAME=$(dpkg-deb -f /tmp/install_deb_package.deb Package) || exit 1
apt-mark manual "$PACKAGE_NAME" || true
DEBIAN_FRONTEND=noninteractive dpkg -i --force-confold /tmp/install_deb_package.deb
INSTALL_RC=$?
if [ "$INSTALL_RC" -eq 0 ]; then apt-mark manual "$PACKAGE_NAME" || true; fi
rm -f /tmp/install_deb_package.deb
exit "$INSTALL_RC"
```

- 安装前执行 `apt-mark manual`；失败仅忽略并继续，因为包可能尚未进入 apt 索引。
- 安装成功后再执行一次 `apt-mark manual`，确保最终 manual 标记生效。
- `dpkg -i` 失败不忽略，任务失败并由 errorDag 清理。
- `--force-confold` 在配置文件冲突时保留机器人已有配置。
- `rm -f` 清理失败不覆盖 dpkg 的退出码。
- 脚本内部不包含 `&&`，避免被 `SshCommandTask` 的 sudo 包装逻辑拆坏。

### FR-DEB-05: 参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `artifactId` | `artifact` | 是 | — | 待安装的 `.deb` 包 |
| `robotIp` | `string` | 是 | — | 目标机器人 IP |
| `robotPort` | `number` | 否 | `22` | SSH 端口 |
| `commandTimeout` | `number` | 否 | `300000` | 安装命令超时(ms) |

### FR-DEB-06: 输出

与 `SshCommandTask` 相同：`done`、`success`、`stdout`、`stderr`、`exitCode`。

### FR-DEB-07: 前端

| 属性 | 值 |
|------|-----|
| `type` | `install-deb-package` |
| `name` | `Install Deb Package` |
| `robotSelection.mode` | `multiple` |
| `params.artifactId.label` | `Deb package (.deb)` |
| `errorDag` | `CleanupDebPackageTask` |

### FR-DEB-08: 前置条件与边界

- 机器人需具备 `dpkg`、`dpkg-deb`、`apt-mark`（Ubuntu/Debian 默认具备）。
- 本任务不停止 `cosmos-update-engine`，不删除 `/var/lib/dpkg/lock*`。
- 本任务不自动安装依赖；依赖缺失时任务失败，现场可先执行 `Fix Broken Packages`。
- 本任务不重启机器人。

---

## 8. 非功能需求

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
