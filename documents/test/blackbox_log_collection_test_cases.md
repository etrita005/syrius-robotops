# Blackbox 收集日志 — 测试用例设计文档

## 1. 概述

本文档定义 "Collect Blackbox Logs"（blackbox 收集日志）功能的测试用例，覆盖后端单元/集成测试与前端 E2E 测试。测试分为纯协议函数测试、任务解析器测试（mock 与参数校验）、flow 集成测试与 UI/E2E 测试。

---

## 2. 后端单元测试

测试执行命令：`npm --workspace backend run test`

### 2.1 协议纯函数（blackboxProtocol）

#### TC-BBL-PROTO-001: cloudTaskID 格式

**前置条件**：无

**测试步骤**：给定固定时间调用 `buildCloudTaskId(date)`

**预期结果**：返回 `YYYY-MMDD-HHMM` 格式（例如 `2026-0907-1030`），月份补零，无秒。

#### TC-BBL-PROTO-002: processList 构造

**前置条件**：无

**测试步骤**：`buildProcessList(["gadgetman", "solorc"])`

**预期结果**：返回 `[{ name: "gadgetman", contextTypes: [{ name: "log" }] }, { name: "solorc", contextTypes: [{ name: "log" }] }]`

#### TC-BBL-PROTO-003: request payload 结构

**前置条件**：无

**测试步骤**：`buildRequestPayload("2026-0907-1030", ["gadgetman"])` 后 JSON.parse

**预期结果**：`cloudTaskID === "2026-0907-1030"`、`action === "createTask"`、`processList[0].name === "gadgetman"`

#### TC-BBL-PROTO-004: 主题构造

**前置条件**：无

**测试步骤**：`buildTopics("ABC123")`

**预期结果**：
- keepalive = `snapshot/blackbox/ABC123/keepalive`
- request = `snapshot/blackbox/ABC123/request`
- response = `snapshot/blackbox/ABC123/response`

#### TC-BBL-PROTO-005: taskFinished 消息解析

**前置条件**：无

**测试步骤**：解析 `{"msg":"taskFinished","cloudTaskID":"...","taskInfo":{"blackBoxTaskID":"BB_01"}}`

**预期结果**：提取 `cloudTaskID` 与 `blackBoxTaskID: "BB_01"`

#### TC-BBL-PROTO-006: 非 taskFinished 消息识别

**前置条件**：无

**测试步骤**：解析 `{"msg":"create task succeeded"}`

**预期结果**：`isCreateTaskSucceeded` 返回 true；`parseTaskFinishedMessage` 对非 `taskFinished` 消息返回 null（或抛错，按实现约定）

#### TC-BBL-PROTO-007: S3 URL 拼装

**前置条件**：无

**测试步骤**：`buildS3Url("s3://blackbox-report-context-fws-cn-cn-northwest-1/", "DID1", "2026-0907-1030_DID1")`

**预期结果**：`s3://blackbox-report-context-fws-cn-cn-northwest-1/2026-0907-1030/DID1/DID1.zip`（首个 `_` 替换为 `/DID1/`，末尾加 `.zip`）

#### TC-BBL-PROTO-008: aws s3 命令拼装

**前置条件**：无

**测试步骤**：`buildS3Commands("blackbox-cn-northwest-1", s3Url)`

**预期结果**：`s3LsCommand` = `aws s3 --profile blackbox-cn-northwest-1 ls {s3Url}`；`s3CpCommand` = `aws s3 --profile blackbox-cn-northwest-1 cp {s3Url} .`

### 2.2 区域配置（blackboxConfig）

#### TC-BBL-CFG-001: cn/ap 配置解析

**前置条件**：无

**测试步骤**：`getBlackboxRegionConfig("cn")` 与 `getBlackboxRegionConfig("ap")`

**预期结果**：broker/bucket/profile 分别匹配国内与海外常量；证书目录解析为 `res/blackbox/cn`、`res/blackbox/ap`（基于模块位置解析）

#### TC-BBL-CFG-002: 非法区域报错

**前置条件**：无

**测试步骤**：`getBlackboxRegionConfig("eu")`

**预期结果**：抛出 `Unsupported blackbox region: eu`

### 2.3 任务解析器（CollectBlackboxLogTask）

#### TC-BBL-TASK-001: 缺 robotInfo 抛错

**前置条件**：无

**测试步骤**：`new CollectBlackboxLogTask().exec({ region: "cn", procList: ["gadgetman"] }, { flowId: "test" })`

**预期结果**：任务失败，错误信息含 `robotInfo` 或 `thingsId`（DeviceID missing）

#### TC-BBL-TASK-002: 进程列表为空抛错

**前置条件**：无

**测试步骤**：`exec({ robotInfo: { thingsId: "DID1" }, region: "cn", procList: [] })`

**预期结果**：任务失败，错误信息含 `Process list`

#### TC-BBL-TASK-003: 非法区域抛错

**前置条件**：无

**测试步骤**：`exec({ robotInfo: { thingsId: "DID1" }, region: "eu", procList: ["gadgetman"] })`

**预期结果**：任务失败，错误信息含 `Unsupported blackbox region`

#### TC-BBL-TASK-004: procList 字符串入参拆分

**前置条件**：注入 fake blackbox client（见 2.4）

**测试步骤**：`procList: "gadgetman, solorc"`

**预期结果**：传入底层 `collectBlackboxLogs` 的 `processNames === ["gadgetman", "solorc"]`（去空白、过滤空项）

### 2.4 Mock 任务（MockCollectBlackboxLogTask）

#### TC-BBL-MOCK-001: Mock 返回模拟成功结果

**前置条件**：使用 `MockCollectBlackboxLogTask`

**测试步骤**：`exec({ robotInfo: { thingsId: "M000000000000" }, region: "cn", procList: ["gadgetman"] }, { flowId: "test" })`

**预期结果**：
- `done === true`、`success === true`
- `deviceId === "M000000000000"`、`region === "cn"`
- `processNames` 含 `gadgetman`
- `s3Url` 以 `s3://blackbox-report-context-fws-cn-cn-northwest-1/` 开头且以 `.zip` 结尾
- `s3LsCommand`/`s3CpCommand` 包含 profile `blackbox-cn-northwest-1`
- `cloudTaskID`、`blackBoxTaskID` 非空
- 执行耗时 ≥ 约 1 秒（模拟延迟）

### 2.5 Flow 集成测试

#### TC-BBL-FLOW-001: 完整两步 DAG（mock）完成且结果含 S3 URL

**前置条件**：ResolverRegistry 注册 `MockGetRobotBasicInfoTask`、`MockCollectBlackboxLogTask`；使用内存 ObjectStore + SpySseManager

**测试步骤**：
1. 按 §5.2 的 DAG（fetch_info + collect_logs）创建 internal flow
2. input：`{ robotIp: "192.168.1.10", robotPort: 22, region: "cn", procList: ["gadgetman"] }`
3. 等待 flow 完成

**预期结果**：
- flow state `COMPLETED`
- `taskStates["fetch_info"]`、`taskStates["collect_logs"]` 均为 `COMPLETED`
- `taskResults["collect_logs"].s3Url` 以 `s3://` 开头并以 `.zip` 结尾
- `taskResults["collect_logs"].s3CpCommand` 含 `aws s3`

#### TC-BBL-FLOW-002: collect 步骤失败时 flow FAILED

**前置条件**：自定义 FailingMock（`onExec` 抛错）注册为 `CollectBlackboxLogTask`

**测试步骤**：同 DAG 创建 flow，等待完成

**预期结果**：flow state `FAILED`；`taskStates["collect_logs"] === "FAILED"`

### 2.6 注册验证

#### TC-BBL-REG-001: Resolver 已注册

**前置条件**：无

**测试步骤**：`new ResolverRegistry()` 注册 `CollectBlackboxLogTask`（real/mock）

**预期结果**：`registry.has("CollectBlackboxLogTask") === true`

---

## 3. E2E 测试用例

测试执行命令：`npm run test:e2e`（from src/，mock backend）

### TC-E2E-BBL-001: 任务类型出现在选择列表

**前置条件**：已创建测试 Solution 并添加机器人；打开 workspace

**测试步骤**：
1. 进入 Tasks 页，打开 Create Task 模态框
2. 搜索/查看 "Collect Blackbox Logs"

**预期结果**：类型可见，显示 "Robot selection: Multiple robots"

### TC-E2E-BBL-002: 多机器人任务计数为 15

**前置条件**：同 TC-E2E-BBL-001

**测试步骤**：在任务类型步骤统计 "Robot selection: Multiple robots"

**预期结果**：共 15 项（Update Algorithm Config 与 Collect Blackbox Logs 加入后由 13 → 15）

### TC-E2E-BBL-003: 选择类型进入机器人选择步骤

**前置条件**：模态框已打开

**测试步骤**：点击 "Collect Blackbox Logs" → Next

**预期结果**：出现 "Select all robots" 与两台测试机器人复选框

### TC-E2E-BBL-004: Params 步骤展示 Region 与进程多选

**前置条件**：已选择一台机器人并进入 Params 步骤

**测试步骤**：
1. 校验 "Region" 下拉框存在且默认值 `cn`
2. 校验进程名候选项（gadgetman 等）以 checkbox 展示
3. 未选进程时 Next 不可用；勾选 "gadgetman"、"solorc" 后 Next 可用

**预期结果**：均符合

### TC-E2E-BBL-005: Confirm 步骤摘要正确

**前置条件**：Params 已配置（region=cn，procList=gadgetman,solorc）

**测试步骤**：进入 Confirm 步骤

**预期结果**：
- 显示 "Task Type: Collect Blackbox Logs"
- 显示选中机器人
- 显示 "Region: cn"、"Processes: gadgetman, solorc"

### TC-E2E-BBL-006: 创建任务并最终成功（mock）

**前置条件**：独立 Solution（避免列表干扰）

**测试步骤**：
1. 完成向导创建 1 个任务
2. 任务列表出现 "Collect Blackbox Logs"
3. 等待 flow 完成

**预期结果**：任务状态摘要为 Success（mock 下 fetch_info ~3s + collect ~1-2s，等待超时 ≤ 30s）

### TC-E2E-BBL-007: 结果详情包含 S3 链接与命令（via API）

**前置条件**：同 TC-E2E-BBL-006 的 Solution

**测试步骤**：
1. 直接经 `/api/flows` 创建 DAG flow（mock 已注册两 resolver）
2. 轮询 flow 至 COMPLETED

**预期结果**：`GET /api/flows` 返回的 `taskResults`/`results` 含 `collect_s3Url`、`collect_s3Ls`、`collect_s3Cp`，均以预期前缀/命令开头

---

## 4. 测试数据

| 数据项 | 值 |
|--------|-----|
| 测试机器人地址 | `192.168.1.10`、`192.168.1.11` |
| Mock thingsId | `M000000000000` |
| Region | `cn`（默认）、`ap` |
| 进程候选项 | 13 个（见需求 §5） |
| Mock 收集延迟 | 约 1~2 秒 |
| Mock 基础信息延迟 | 3000ms（复用 MockGetRobotBasicInfoTask） |

---

## 5. 测试覆盖率目标

| 模块 | 目标覆盖 |
|------|---------|
| `blackboxProtocol` | 全部纯函数分支（payload/解析/URL/命令） |
| `blackboxConfig` | cn/ap/非法区域 |
| `CollectBlackboxLogTask` | 参数校验 + procList 拆分 |
| `MockCollectBlackboxLogTask` | 返回结构/URL/命令/延迟 |
| DAG + Flow | fetch_info → collect_logs 全链路与失败路径 |
| 前端任务向导 | 类型出现、多选、params、confirm、结果详情 |
