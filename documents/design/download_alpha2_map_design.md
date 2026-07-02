# Download Alpha2 Map Task — 软件设计文档

## 1. 概述

`SshFileDownloadTask` 是一个基于 `flowed` 框架 `ITaskResolver` 接口实现的 BaseTask 子类，负责通过 SSH/SFTP 协议从远程目标机器人下载文件到本机指定目录，并执行完整性校验。

本任务与已有的 `SshFileTransferTask`（本机 → 机器人上传）形成对称的双向文件传输能力。

---

## 2. 设计约束

- 遵循 `ITaskResolver` 接口规范，通过 `ResolverRegistry` 注册后由 `TaskFlowEngine` 调度执行
- 使用 `ssh2` 库的 SFTP 子系统完成文件下载，与 `SshFileTransferTask` 共享连接参数风格
- 远程校验和通过 SSH 执行 `sha256sum` 命令获取
- 继承 `BaseTask` 直接实现（不继承 `SshFileTransferTask`），因下载与上传流程差异较大
- 所有日志和注释使用英文
- 所有代码使用 TypeScript + ES6 模块语法

---

## 3. 接口设计

### 3.1 参数接口

```typescript
export interface SshFileDownloadParams {
  // --- 连接参数 ---
  robotIp: string;
  robotPort?: number;           // SSH 端口，默认 22
  robotMdnsDomain?: string;     // mDNS 域名（优先于 IP）
  timeout?: number;             // 超时时间，默认 30000ms
  retryCount?: number;          // 重试次数，默认 3
  sshUsername: string;          // SSH 用户名
  sshPassword: string;          // SSH 密码

  // --- 下载参数 ---
  remoteFilePath: string;       // 远程文件绝对路径
  localTargetDir: string;       // 本机目标目录

  // --- 校验参数 ---
  verifyChecksum?: boolean;     // 是否校验完整性，默认 true
  checksumAlgorithm?: "sha256" | "md5"; // 校验算法，默认 "sha256"
}
```

### 3.2 结果接口

```typescript
export interface SshFileDownloadResult {
  done: boolean;
  success: boolean;
  bytesTransferred: number;     // 传输字节数
  localFilePath: string;        // 本机保存路径（targetDir/basename）
  localChecksum: string;        // 本机文件校验和
  remoteChecksum: string;       // 远程文件校验和
  integrityVerified: boolean;   // 校验和是否匹配
}
```

---

## 4. 执行流程

```
┌─────────────────────────────────────────────────────┐
│               SshFileDownloadTask.exec               │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. buildParams()  构建 SshFileDownloadParams       │
│                      ↓                               │
│  2. 确保本机目标目录存在 (mkdir -p)                   │
│                      ↓                               │
│  3. SSH Connect (with retry)                         │
│     ┌──────────────────────────────────┐             │
│     │ 3a. SFTP stat remoteFilePath     │             │
│     │     验证远程文件存在              │             │
│     │ 3b. SSH exec sha256sum            │             │
│     │     计算远程文件校验和             │             │
│     │ 3c. SFTP fastGet() 下载文件      │             │
│     │ 3d. 记录传输字节数               │             │
│     └──────────────────────────────────┘             │
│                      ↓                               │
│  4. 计算本机文件校验和（SHA-256）                      │
│                      ↓                               │
│  5. verifyChecksum?                                  │
│     ├── true:  对比 remoteChecksum vs localChecksum  │
│     │         ├── 匹配 → integrityVerified = true    │
│     │         └── 不匹配 → 抛出完整性错误             │
│     └── false: integrityVerified = false (跳过校验)  │
│                      ↓                               │
│  6. conn.end() 关闭连接                              │
│                      ↓                               │
│  7. 返回 SshFileDownloadResult                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 4.1 重试策略

- 传输阶段失败时执行重试，采用线性退避（`sleep(1000 * attempt)`）
- 完整性校验失败**不**触发重试（与上传任务行为一致）
- 最多重试 `retryCount` 次（默认 3 次）

### 4.2 文件命名

下载文件保存为 `{localTargetDir}/{basename(remoteFilePath)}`，即使用远程文件的基础名称。对于 Alpha2 Map 任务，固定为 `{localTargetDir}/sketch.zip`。

---

## 5. 任务注册

### 5.1 后端 Resolver

注册名称：`SshFileDownloadTask`

- Real: `SshFileDownloadTask` (扩展 `BaseTask`)
- Mock: `MockSshFileDownloadTask` (扩展 `SshFileDownloadTask`, 模拟 5 秒延迟)

### 5.2 前端 Task Type

注册类型：`download-alpha2-map`

DAG 定义（单任务）：

```typescript
const DOWNLOAD_ALPHA2_MAP_DAG: DagDefinition = {
  tasks: {
    download: {
      requires: ["robotIp", "robotPort", "localTargetDir"],
      resolver: {
        name: "SshFileDownloadTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          localTargetDir: "localTargetDir",
          remoteFilePath: { value: "/opt/cosmos/map/preview/sketch.zip" },
        },
        results: { done: "download_result" },
      },
      provides: ["download_result"],
    },
  },
};
```

---

## 6. 文件清单

### 6.1 新建文件

| 文件 | 说明 |
|------|------|
| `src/backend/src/tasks/real/sshFileDownloadTask.ts` | 真实下载任务实现 |
| `src/backend/src/tasks/mock/mockSshFileDownloadTask.ts` | Mock 下载任务实现 |
| `documents/requirements/download_alpha2_map_requirements.md` | 需求规格说明书 |

| `documents/design/download_alpha2_map_design.md` | 本文件 |

| `documents/ui-ux/download-alpha2-map/download_alpha2_map_ui.md` | UI/UX 线框图 |

| `documents/test/download_alpha2_map_test_cases.md` | 测试用例设计 |

### 6.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/backend/src/tasks/index.ts` | 导出新任务类及类型 |
| `src/backend/src/index.ts` | 注册新 resolver |
| `documents/design/backend_task_design.md` | 添加新任务章节 |
| `src/frontend/src/data/taskRegistry.ts` | 添加 `download-alpha2-map` 任务类型及 DAG |
| `src/backend/src/test.ts` | 添加新任务单元测试 |
| `src/e2e-test/tests/task-management.spec.ts` | 添加 E2E 测试用例 |

---

## 7. 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| 远程文件不存在（SFTP stat 失败） | 抛出 `Remote file not found: {remoteFilePath}` |
| 本机目录创建失败 | 抛出 `mkdir` 相关权限错误 |
| SSH 连接失败 | 重试 maxRetries 次，最后抛出连接错误 |
| SFTP 下载失败 | 重试 maxRetries 次，最后抛出传输错误 |
| 校验和不匹配 | 抛出 `File integrity check failed: local={hash}, remote={hash}` |

---

## 8. 与现有系统的关系

```
SshFileTransferTask (上传: 本机 → 机器人)
    ↑ 已有
    |
BaseTask (ITaskResolver)
    |
    ↓ 新增
SshFileDownloadTask (下载: 机器人 → 本机)
    ↓ DAG 配置
Download Alpha2 Map (specific task: /opt/cosmos/map/preview/sketch.zip)
```

`SshFileDownloadTask` 是通用的 SFTP 下载任务，通过 DAG 参数中的 `remoteFilePath: { value: "..." }` 配置为特化的 Alpha2 Map 下载任务，未来可复用为其他文件的下载任务。
