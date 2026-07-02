# 下载 Alpha2 建图预览包 — 需求规格说明书

## 1. 概述

本功能允许 FAE 通过 RobotOps Studio 从目标 Alpha2 机器人中下载建图预览包（sketch.zip），并保存至本机指定目录。该功能用于 FAE 在现场诊断、分享或备份机器人当前建图数据时使用。

**关键用例**：用户选择一个目标机器人，指定本机保存目录，系统通过 SSH/SFTP 从机器人路径 `/opt/cosmos/map/preview/sketch.zip` 下载文件到本机。

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **建图预览包（Map Package）** | Alpha2 机器人在 `/opt/cosmos/map/preview/sketch.zip` 路径下的建图数据压缩包 |
| **目标目录（Target Directory）** | 用户在本机指定的文件保存目录路径 |
| **下载任务（Download Task）** | 通过 Task Flow Engine 执行的 SFTP 下载任务 |

---

## 3. 功能需求

### FR-01: 任务类型定义

系统应在任务选择器中提供 "Download Alpha2 Map" 任务类型，名称为 "Download Alpha2 Map"，描述为 "Download the Alpha2 map package from the selected robot to a local directory."

### FR-02: 机器人选择

- 任务仅支持**单机器人**模式（`robotSelection.mode: "single"`）
- 用户必须选择恰好一个目标机器人

### FR-03: 参数配置

任务需用户提供以下参数：

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `localTargetDir` | `text` | 是 | `/tmp` | 本机保存目录的绝对路径 |

其他参数由系统自动指定：
- `remoteFilePath`: 固定为 `/opt/cosmos/map/preview/sketch.zip`
- `sshUsername`: 使用系统默认 SSH 凭据 `developer`
- `sshPassword`: 使用系统默认 SSH 凭据 `developer`

### FR-04: 下载执行

- 系统通过 SSH 连接到目标机器人
- 使用 SFTP 协议从 `remoteFilePath` 下载文件
- 文件保存为 `{localTargetDir}/sketch.zip`（使用远程文件的 basename）
- 支持传输进度日志记录
- 支持重试机制（默认 3 次，线性退避）

### FR-05: 完整性校验

- 下载前在机器人端计算远程文件的 SHA-256 校验和
- 下载后在本机计算本地文件的 SHA-256 校验和
- 比较两个校验和，确保文件传输完整性
- 校验和不匹配时任务标记为失败

### FR-06: 任务状态反馈

- 通过 SSE 实时推送任务状态变更（创建、运行中、完成、失败）
- 完整的任务结果包含：传输字节数、本地文件路径、校验和比对结果

### FR-07: Mock 模式支持

- 在 `--mock` 模式下，下载任务应模拟执行（不实际连接机器人），返回模拟的成功结果
- Mock 模式下延迟 5 秒模拟下载过程

---

## 4. 非功能需求

### NFR-01: 代码规范

- 所有代码使用 TypeScript + ES6 模块语法
- 遵循项目现有 BaseTask 任务解析器架构
- 日志使用 Pino 框架（`this.log`），禁止使用 `console.log`
- 所有日志和注释使用英文

### NFR-02: 错误处理

- 远程文件不存在 → 抛出明确错误，包含路径信息
- 本机目录创建失败 → 抛出权限错误
- SSH 连接失败 → 重试后抛出最后错误
- SFTP 传输失败 → 重试后抛出最后错误
- 校验和不匹配 → 抛出完整性错误，包含 local 和 remote 值

### NFR-03: 安全性

- SSH 密码不记录到日志中
- 不暴露机器人内部路径结构给前端无关逻辑

---

## 5. 约束条件

- 仅支持 Alpha2 系列机器人（路径 `/opt/cosmos/map/preview/sketch.zip` 为 Alpha2 特有）
- 需要机器人端 SSH 服务可用（端口 22）
- 需要本机有写入目标目录的权限
- 下载的文件名固定为 `sketch.zip`，不支持重命名
