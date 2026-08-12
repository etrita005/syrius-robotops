# 许可证测试界面模块 — 需求规格说明书

## 1. 概述

许可证测试界面是一个临时/调试用的微型程序界面，当 RobotOps Studio 后端启动时，仅显示此界面，隐藏所有现有业务模块（Solutions、Artifacts、Robots、Tasks、System Logs）。该界面通过 SSH 连接至一台机器人，通过 `adb shell content` 命令读取和写入三个许可证密钥。

**关键用例**：用户输入机器人 IP 和端口，点击「Connect」建立 SSH 连接，自动读取机器人上的三个许可证配置项；用户可修改配置项值后点击「Apply」将其写回机器人。

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **许可证配置（License Config）** | 存储在机器人 `mockkv` Content Provider 中的三个键值对。 |
| **机器人会话（Robot Session）** | 后端内存中存储的当前目标机器人标识（IP、端口），非持久 TCP/SSH 连接。 |
| **ADB** | Android Debug Bridge，可通过 SSH 在机器人上执行的可执行文件。 |
| **mockkv** | 机器人 Content Provider URI：`content://com.syriusrobotics.platform.launcher.mockkv/kv`。 |
| **Upsert** | 先查询键是否存在，存在则更新，不存在则插入的操作策略。 |

---

## 3. 设计原则

1. **单一界面**：后端启动后仅渲染许可证测试界面，替换原有 RobotOps Studio 全部 UI。
2. **无状态 SSH**：每次操作建立独立 SSH 连接，完成后关闭。后端仅内存中记录当前目标机器人。
3. **先连后读**：成功连接后自动读取配置，无需用户手动点击「Read」。
4. **写后自读**：Apply 成功后自动重新读取配置以刷新 UI 字段。
5. **Mock 模式支持**：前端开发和 E2E 测试时可使用 Mock 模式，无需真实机器人。

---

## 4. 数据模型

### 4.1 许可证配置 Schema

```json
{
  "clear-janitor-licenses": "100",
  "clear-janitor-license-type": "Trial",
  "clear-janitor-license-authorization-start-time": "2024-01-15T08:30:00Z"
}
```

| 键 | 标签 | 控件类型 | 校验规则 |
|-----|------|---------|-----------|
| `clear-janitor-licenses` | Clear-Janitor Licenses Pool Quota | Number Input | 非负整数 |
| `clear-janitor-license-type` | Clear-Janitor License Type | Dropdown | `None` / `Trial` / `Formal` |
| `clear-janitor-license-authorization-start-time` | Authorization Start Time | DatePicker + TimePicker | 有效 ISO 8601 格式，带 `Z` 后缀 |

### 4.2 机器人会话 Schema

```json
{
  "robotIp": "192.168.1.100",
  "robotPort": 22,
  "connectedAt": 1721664200000
}
```

---

## 5. 功能需求

### FR-LIC-001：默认界面
当用户在浏览器中打开应用程序时，页面仅渲染许可证测试界面。原有的顶部导航、解决方案选择器、制品管理器、机器人视图、任务视图和系统日志视图均不可见。

### FR-LIC-002：连接输入
界面提供以下输入字段：
- 机器人 IP 地址（IPv4 或 IPv6）
- 机器人 SSH 端口，默认值为 `22`

### FR-LIC-003：连接按钮
- 界面提供 **Connect** 按钮。
- 点击后，前端调用后端 `/api/license-test/connect` 接口，传入 IP 和端口。
- 后端使用配置文件中的凭据（`developer`/`developer`）验证 SSH 连接，存储机器人会话，并自动读取许可证配置。
- 成功后，许可证配置字段填充为从机器人读取的值。
- 失败时，显示错误信息，配置字段保持禁用。

### FR-LIC-004：断开连接按钮
- 界面提供 **Disconnect** 按钮，仅在已连接时可用。
- 点击后，前端调用 `/api/license-test/disconnect`。
- 后端清除内存中的机器人会话。
- UI 恢复至未连接状态：配置字段禁用，值清空。

### FR-LIC-005：读取配置按钮
- 界面提供 **Read License Config** 按钮，仅在已连接时可用。
- 点击后，前端调用 `/api/license-test/read`。
- 后端查询机器人上的每个许可证键并返回当前值。
- UI 使用返回值更新三个配置字段。

### FR-LIC-006：应用配置按钮
- 界面提供 **Apply License Config** 按钮，仅在已连接时可用。
- 点击后，前端调用 `/api/license-test/apply`，传入三个配置字段的当前值。
- 后端将每个键写入机器人。每个键先查询是否存在（upsert）：存在则更新，不存在则插入。
- 成功后，UI 显示确认消息并自动重新读取配置（写后自读）。

### FR-LIC-007：单会话模式
- 后端同一时间只维护一个机器人会话。连接至新机器人时替换之前的会话并记录警告日志。

---

## 6. 用例模型

```
用户 --> 输入 IP/端口 --> 点击 Connect --> 自动读取配置 --> 修改配置值 -->
  点击 Apply --> 自动回读配置 --> 验证结果 --> 点击 Disconnect
```

| 用例编号 | 名称 | 描述 |
|----------|------|------|
| UC-LIC-01 | 连接机器人 | 用户输入 IP 和端口，点击 Connect，后端验证 SSH 并读取配置 |
| UC-LIC-02 | 断开机器人 | 用户点击 Disconnect，后端清除会话，UI 恢复未连接状态 |
| UC-LIC-03 | 读取许可证配置 | 用户点击 Read，从机器人拉取最新配置值 |
| UC-LIC-04 | 应用许可证配置 | 用户修改配置值后点击 Apply，将值写入机器人 |
| UC-LIC-05 | 切换目标机器人 | 用户输入新 IP 后直接点击 Connect，覆盖当前会话 |

---

## 7. 接口合约

### 7.1 后端 API 端点

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/license-test/connect` | 验证 SSH，存储会话，自动读取配置 |
| POST | `/api/license-test/disconnect` | 清除会话 |
| GET | `/api/license-test/session` | 返回当前会话状态 |
| POST | `/api/license-test/read` | 从机器人读取许可证配置 |
| POST | `/api/license-test/apply` | 将许可证配置写入机器人 |

### 7.2 请求/响应合约

#### Connect
请求：`{ "robotIp": "192.168.1.100", "robotPort": 22 }`
响应：`{ "connected": true, "robotIp": "192.168.1.100", "robotPort": 22, "config": { ... } }`

#### Disconnect
响应：`{ "connected": false }`

#### Session
响应：`{ "connected": false }` 或 `{ "connected": true, "robotIp": "...", "robotPort": 22 }`

#### Read
响应：`{ "config": { "clear-janitor-licenses": "100", "clear-janitor-license-type": "Trial", "clear-janitor-license-authorization-start-time": "2024-01-15T08:30:00Z" } }`

#### Apply
请求：`{ "config": { "clear-janitor-licenses": "100", "clear-janitor-license-type": "Trial", "clear-janitor-license-authorization-start-time": "2024-01-15T08:30:00Z" } }`
响应：`{ "applied": true }`

---

## 8. 校验与约束

| 约束编号 | 描述 | 校验规则 |
|----------|------|----------|
| CV-LIC-001 | 机器人 IP 校验 | 有效 IPv4 或 IPv6 地址 |
| CV-LIC-002 | 端口校验 | 1–65535 之间的整数 |
| CV-LIC-003 | 许可证数量校验 | 非负整数字符串 |
| CV-LIC-004 | 许可证类型校验 | 必须为 `None`、`Trial`、`Formal` 之一 |
| CV-LIC-005 | 授权开始时间校验 | 非空字符串，ISO 8601 格式推荐 |

---

## 9. 错误处理

| 错误码 | 条件 | 消息 |
|--------|------|------|
| `ROBOT_UNREACHABLE` (502) | SSH 连接失败 | "SSH connection failed: ..." |
| `ROBOT_COMMAND_FAILED` (502) | adb 命令执行失败 | "Failed to ... (exit code ...): ..." |
| `ROBOT_TIMEOUT` (504) | 连接或命令超时 | "SSH connection/command timed out after ...ms" |
| `NO_SESSION` (400) | 读取/应用时无活动会话 | "No active robot session. Connect to a robot first." |
| `INVALID_IP` (400) | IP 格式无效 | "Invalid IP address." |
| `INVALID_PORT` (400) | 端口无效 | "Invalid port." |
| `INVALID_LICENSES` (400) | 许可证数量无效 | "... must be a string containing a non-negative integer." |
| `INVALID_LICENSE_TYPE` (400) | 类型无效 | "... must be one of: None, Trial, Formal." |

---

## 10. UI/UX 需求

### UI-LIC-001：顶部 Header
顶部 Header 显示 "RobotOps" 前缀 + "License Test" 标题，右侧提供明/暗主题切换按钮。

### UI-LIC-002：连接卡片
连接卡片包含 IP 文本输入、端口数字输入、Connect/Disconnect 按钮及连接状态指示器。

### UI-LIC-003：许可证配置卡片
许可证配置卡片包含三个字段：许可证池配额（数字输入）、许可证类型（下拉选择）、授权开始时间（日期选择器 + 时间输入）。卡片连接前禁用。

### UI-LIC-004：读写按钮
Read 和 Apply 按钮位于配置卡片底部，连接前和操作进行中禁用。

### UI-LIC-005：调试输出
可选调试输出区域显示最近的命令输出（stdout/stderr），用于排查错误。

### UI-LIC-006：主题支持
支持明/暗主题切换，沿用 Carbon Design System `white` / `g100` 主题。

---

## 11. 非功能性需求

### NF-LIC-001：技术栈
- 前端：React 18、TypeScript、Carbon Design System、Vite
- 后端：Node.js、TypeScript、Hono
- SSH 库：`ssh2`

### NF-LIC-002：安全性
- SSH 凭据不暴露给前端，仅在后端配置文件读取。
- 不记录密码、令牌或密钥。
- 前端和后端均校验用户输入。

### NF-LIC-003：日志
- 后端操作使用 Pino 框架记录。
- 日志仅使用英文。
- SSH 命令和结果可记录于 `info`/`debug` 级别，凭据除外。

### NF-LIC-004：国际化
- UI 标签和信息使用英文。

### NF-LIC-005：错误处理
- 网络错误、SSH 失败和 ADB 命令失败通过 toast 通知或内联错误文本提示用户。
- UI 清晰区分 disconnected、connecting、connected、busy 状态。

### NF-LIC-006：性能
- 每次操作建立独立 SSH 连接，适用于低频调试场景。
- 无持久化存储或后台轮询。
- UI 在 busy 状态时禁用操作按钮。

---

## 12. 版本管理

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-22 | 初始版本：替换 RobotOps Studio UI 为许可证测试界面 |
