# SSH File Transfer Task — 软件设计文档

> 本文档描述基于 SSH/SFTP 协议传输文件到目标机器人并执行完整性校验的 Task 设计。

---

## 1. 概述

`SshFileTransferTask` 是一个基于 `flowed` 框架 `ITaskResolver` 接口实现的 Task，负责将本地文件通过 SFTP 协议传输到远程目标机器，并在传输完成后执行文件完整性校验（checksum 比对），确保文件在传输过程中未发生损坏。

---

## 2. 设计约束

- 遵循 `ITaskResolver` 接口规范，通过 `ResolverRegistry` 注册后由 `TaskFlowEngine` 调度执行。
- 使用 `ssh2` 库的 SFTP 子系统完成文件传输，与 `SshCommandTask` 共享连接参数风格。
- 使用 `ChecksumService` 计算本地文件校验和，不自行实现哈希逻辑。
- 远程校验和通过 SSH 执行 `sha256sum` 命令获取，复用已建立的 SSH 连接。
- 所有日志和注释使用英文。
- 所有代码使用 TypeScript + ES6 模块语法。

---

## 3. 接口设计

### 3.1 参数接口

```typescript
export interface SshFileTransferParams {
  // --- 连接参数 ---
  robotIp: string;              // 目标机器人 IP 地址
  robotPort?: number;           // SSH 端口，默认 22
  robotMdnsDomain?: string;     // mDNS 域名（优先于 IP）
  timeout?: number;             // 超时时间，默认 30000ms
  retryCount?: number;          // 重试次数，默认 3
  sshUsername: string;          // SSH 用户名
  sshPassword: string;          // SSH 密码

  // --- 传输参数 ---
  localFilePath: string;        // 本地文件绝对路径
  remoteFilePath: string;       // 远程目标文件绝对路径

  // --- 校验参数 ---
  verifyChecksum?: boolean;     // 是否校验完整性，默认 true
  checksumAlgorithm?: "sha256" | "md5"; // 校验算法，默认 "sha256"
}
```

### 3.2 结果接口

```typescript
export interface SshFileTransferResult {
  success: boolean;             // 传输是否成功
  bytesTransferred: number;     // 传输字节数
  localChecksum: string;        // 本地文件校验和
  remoteChecksum: string;       // 远程文件校验和
  integrityVerified: boolean;   // 校验和是否匹配
}
```

---

## 4. 执行流程

```
┌─────────────────────────────────────────────────────┐
│                  SshFileTransferTask.exec            │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. buildParams()  构建 SshFileTransferParams       │
│                      ↓                               │
│  2. ChecksumService.computeSha256(localFilePath)     │
│     计算本地文件校验和                                │
│                      ↓                               │
│  3. SSH Connect (with retry)                         │
│     ┌──────────────────────────────────┐             │
│     │ 3a. conn.sftp() 获取 SFTP 通道   │             │
│     │ 3b. sftp.fastPut() 传输文件      │             │
│     │ 3c. 记录传输字节数               │             │
│     └──────────────────────────────────┘             │
│                      ↓                               │
│  4. verifyChecksum?                                  │
│     ├── true:  SSH exec sha256sum remoteFilePath     │
│     │         对比 localChecksum vs remoteChecksum   │
│     │         ├── 匹配 → integrityVerified = true    │
│     │         └── 不匹配 → 抛出完整性错误             │
│     └── false: integrityVerified = false (跳过校验)  │
│                      ↓                               │
│  5. conn.end() 关闭连接                              │
│                      ↓                               │
│  6. 返回 SshFileTransferResult                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 4.1 重试策略

- 传输阶段失败时执行重试，采用线性退避（`sleep(1000 * attempt)`）。
- 完整性校验失败 **不** 触发重试，因为校验失败意味着已传输文件损坏，需要上层逻辑决定如何处理。
- 最多重试 `retryCount` 次（默认 3 次）。

### 4.2 超时控制

- 默认超时 30000ms，比 `SshCommandTask` 的 10000ms 更长，适应文件传输场景。
- 超时后关闭 SSH 连接并抛出超时错误。

---

## 5. 模块设计

### 5.1 类图

```
ITaskResolver (flowed)
    │
    ├── SshFileTransferTask
    │       - buildParams()
    │       - exec()
    │       - transferFile()
    │       - verifyRemoteChecksum()
    │
    └── MockSshFileTransferTask extends SshFileTransferTask
            - exec() → sleep 5s → 返回成功结果
```

### 5.2 SshFileTransferTask

| 方法 | 职责 |
|------|------|
| `buildParams(params)` | 从 `ValueMap` 构建 `SshFileTransferParams` |
| `exec(params)` | 主入口，协调传输 + 校验流程 |
| `transferFile(conn, localPath, remotePath, timeout)` | 通过 SFTP 传输文件，返回传输字节数 |
| `verifyRemoteChecksum(conn, remotePath, algorithm, timeout)` | 通过 SSH exec 执行远端校验和命令，返回校验和字符串 |

### 5.3 MockSshFileTransferTask

- 继承 `SshFileTransferTask`。
- 覆写 `exec()` 方法：sleep 5 秒模拟传输过程，然后返回成功结果。
- 不执行实际的网络连接和文件传输。

---

## 6. 与现有模块的集成

### 6.1 注册方式

在 `src/backend/src/index.ts` 中注册：

```typescript
registerTasks(resolverRegistry, mock, [
  // ...existing tasks
  { name: "SshFileTransferTask", real: SshFileTransferTask, mock: MockSshFileTransferTask },
]);
```

### 6.2 依赖关系

```
SshFileTransferTask
  ├── ssh2 (SFTP 传输)
  ├── ChecksumService (本地文件校验和)
  └── flowed/ITaskResolver (接口规范)
```

### 6.3 在 Flow DAG 中的使用示例

```json
{
  "tasks": {
    "transfer-firmware": {
      "resolver": { "name": "SshFileTransferTask" },
      "params": {
        "robotIp": "$robotIp",
        "sshUsername": "$sshUsername",
        "sshPassword": "$sshPassword",
        "localFilePath": "/tmp/firmware.bin",
        "remoteFilePath": "/tmp/firmware.bin",
        "verifyChecksum": true
      },
      "provides": ["transferResult"]
    }
  }
}
```

---

## 7. 日志规范

所有日志使用 `[SshFileTransfer]` 前缀：

- `[SshFileTransfer] Connecting to {username}@{host}:{port}`
- `[SshFileTransfer] Computing local checksum for {localFilePath}`
- `[SshFileTransfer] Transferring {localFilePath} -> {remoteFilePath}`
- `[SshFileTransfer] Transfer progress: {transferred}/{total} bytes`
- `[SshFileTransfer] Transfer completed: {bytes} bytes`
- `[SshFileTransfer] Verifying remote checksum ({algorithm})`
- `[SshFileTransfer] Integrity check passed: {checksum}`
- `[SshFileTransfer] Integrity check FAILED: local={localChecksum}, remote={remoteChecksum}`
- `[SshFileTransfer] Attempt {n}/{max} failed: {error}`

---

## 8. 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| SSH 连接失败 | 重试，超过次数后抛出错误 |
| SFTP 传输失败 | 重试，超过次数后抛出错误 |
| 传输超时 | 关闭连接，抛出超时错误 |
| 本地文件不存在 | 直接抛出错误，不重试 |
| 远程校验和命令失败 | 重试校验命令，失败后抛出错误 |
| 校验和不匹配 | 抛出 `File integrity check failed` 错误，不自动重试 |
