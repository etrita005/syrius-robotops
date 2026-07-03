# 后端系统维护任务 — 测试用例设计文档

## 1. 概述

本文档定义 SyncTimeTask、UninstallL4TDownloaderTask、FixBrokenPackagesTask 三个任务的单元测试用例。测试使用 Node.js 内置 `node:test` + `node:assert`，在 `src/backend/src/test.ts` 中实施。

---

## 2. SyncTimeTask 测试用例

### TC-SYNC-001: getSshCommand 包含 date -s、hwclock --systohc 和 timedatectl

**测试目标**：验证生成的命令包含完整的时间同步命令链。

| 项 | 值 |
|----|-----|
| **前置条件** | 无 |
| **输入** | 调用 `getSshCommand()` |
| **预期结果** | 返回字符串包含 `date -s`、`hwclock --systohc`、`timedatectl set-local-rtc 0` |

### TC-SYNC-002: buildParams 强制 sudo=true, retryCount=1

**测试目标**：验证参数构建正确设置 sudo 和重试次数。

| 项 | 值 |
|----|-----|
| **前置条件** | 无 |
| **输入** | `buildParams({ robotIp: "192.168.1.10" })` |
| **预期结果** | `sudo === true`, `retryCount === 1` |

### TC-SYNC-003: commandTimeout 默认 10000ms

**测试目标**：验证默认命令超时。

| 项 | 值 |
|----|-----|
| **输入** | `buildParams({ robotIp: "192.168.1.10" })` |
| **预期结果** | `commandTimeout === 10000` |

### TC-SYNC-004: onExec 输出包含 syncedTime

**测试目标**：验证 mock 模式输出包含时间字符串。

| 项 | 值 |
|----|-----|
| **前置条件** | 使用 MockSyncTimeTask |
| **输入** | `onExec({})` |
| **预期结果** | 返回对象包含 `done: true`, `success: true`, `syncedTime` 为 string 且非空 |

---

## 3. UninstallL4TDownloaderTask 测试用例

### TC-UNINST-001: getSshCommand 包含 dpkg --purge

**测试目标**：验证命令包含 `dpkg --purge l4t-downloader`。

| 项 | 值 |
|----|-----|
| **前置条件** | 无 |
| **输入** | 调用 `getSshCommand()` |
| **预期结果** | 返回字符串包含 `dpkg --purge l4t-downloader` |

### TC-UNINST-002: getSshCommand 包含 systemctl stop, sleep, rm, dpkg --purge

**测试目标**：验证命令包含完整的锁清理 + 卸载链。

| 项 | 值 |
|----|-----|
| **前置条件** | 无 |
| **输入** | 调用 `getSshCommand()` |
| **预期结果** | 包含 `systemctl stop cosmos-update-engine.service`、`sleep 3`、`rm -f /var/lib/dpkg/lock*`、`dpkg --purge l4t-downloader` |

### TC-UNINST-003: buildParams 强制 sudo=true, retryCount=1

**测试目标**：验证参数构建。

| 项 | 值 |
|----|-----|
| **输入** | `buildParams({ robotIp: "192.168.1.10" })` |
| **预期结果** | `sudo === true`, `retryCount === 1` |

### TC-UNINST-004: commandTimeout 默认 60000ms

**测试目标**：验证默认命令超时。

| 项 | 值 |
|----|-----|
| **输入** | `buildParams({ robotIp: "192.168.1.10" })` |
| **预期结果** | `commandTimeout === 60000` |

### TC-UNINST-005: Mock 返回成功

**测试目标**：验证 mock 模式返回成功。

| 项 | 值 |
|----|-----|
| **前置条件** | 使用 MockUninstallL4TDownloaderTask |
| **输入** | `onExec({})` |
| **预期结果** | 返回 `{ done: true, success: true, stdout, stderr, exitCode: 0 }` |

---

## 4. FixBrokenPackagesTask 测试用例

### TC-FIX-001: getSshCommand 包含 systemctl stop, sleep 3, dpkg --configure -a

**测试目标**：验证命令包含 systemctl stop + 锁清理前缀 + dpkg --configure -a。

| 项 | 值 |
|----|-----|
| **前置条件** | 无 |
| **输入** | 调用 `getSshCommand()` |
| **预期结果** | 包含 `systemctl stop cosmos-update-engine.service`、`sleep 3`、`rm -f /var/lib/dpkg/lock*`、`dpkg --configure -a` |

### TC-FIX-002: getSshCommand 包含 rm -f /var/lib/dpkg/lock*

**测试目标**：验证命令包含锁文件清理（带 `-f` 标志）。

| 项 | 值 |
|----|-----|
| **输入** | 调用 `getSshCommand()` |
| **预期结果** | 包含 `rm -f /var/lib/dpkg/lock*` |

### TC-FIX-003: getSshCommand 包含 fix-broken 和 cosmos apt 路径

**测试目标**：验证 apt 修复命令使用正确的 cosmos 配置路径。

| 项 | 值 |
|----|-----|
| **输入** | 调用 `getSshCommand()` |
| **预期结果** | 包含 `--fix-broken install -y` 和 `/opt/cosmos/var/cosmos_update_engine/apt` |

### TC-FIX-004: buildParams 强制 sudo=true, retryCount=1

**测试目标**：验证参数构建。

| 项 | 值 |
|----|-----|
| **输入** | `buildParams({ robotIp: "192.168.1.10" })` |
| **预期结果** | `sudo === true`, `retryCount === 1` |

### TC-FIX-005: commandTimeout 默认 120000ms

**测试目标**：验证默认命令超时。

| 项 | 值 |
|----|-----|
| **输入** | `buildParams({ robotIp: "192.168.1.10" })` |
| **预期结果** | `commandTimeout === 120000` |

### TC-FIX-006: Mock 返回成功

**测试目标**：验证 mock 模式返回成功。

| 项 | 值 |
|----|-----|
| **前置条件** | 使用 MockFixBrokenPackagesTask |
| **输入** | `onExec({})` |
| **预期结果** | `{ done: true, success: true, stdout, stderr, exitCode: 0 }` |

---

## 5. 用例与需求对应

| 需求 | 覆盖用例 |
|------|---------|
| FR-SYNC-01 ~ FR-SYNC-05 | TC-SYNC-001 ~ TC-SYNC-004 |
| FR-UNINST-01 ~ FR-UNINST-05 | TC-UNINST-001 ~ TC-UNINST-005 |
| FR-FIX-01 ~ FR-FIX-04 | TC-FIX-001 ~ TC-FIX-006 |
| NFR-02 (Mock 模式) | TC-SYNC-004, TC-UNINST-005, TC-FIX-006 |
