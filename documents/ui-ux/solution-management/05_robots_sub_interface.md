# Robots 子界面 UI/UX 设计文档

> 本文档描述打开 Solution 后的 Robots 子界面的视觉布局、交互流程与状态定义。
> 对应线框图：
> - 缩略图视图：`documents/ui-ux/solution-management/05_robots_sub_interface.png`
> - 列表视图：`documents/ui-ux/solution-management/06_robots_list_view.png`

---

## 1. 界面布局

### 1.1 整体结构

当用户打开某个 Solution 后，主工作区左侧出现垂直导航栏，包含以下入口：

- **Robots**（当前文档主题，高亮选中）
- Upgrade Packages
- Maps
- Program Configs
- Diagnostics
- Logs

点击 "Robots" 后，主内容区切换为 Robots 子界面。

### 1.2 布局草图

```
+-------------------------------------------------------------+
|  RobotOps Studio        Solutions | Artifacts          v1.0.0 |
+-------------------------------------------------------------+
| Active Solution: Customer A — Site Alpha      [Switch] [X]  |
+----------+--------------------------------------------------+
| Robots   |  Robots                              [Grid][List]|
| Upgrade  |  +---------------------------------------------+ |
| Packages |  | Search...    [Add Robot] [Batch Add]        | |
| Maps     |  +---------------------------------------------+ |
| Program  |  | +------+  +------+  +------+               | |
| Configs  |  | | [x]  |  | [ ]  |  | [ ]  |               | |
| Diagnos- |  | |Robot |  |Robot |  |Robot |               | |
| tics     |  | | icon |  | icon |  | icon |               | |
| Logs     |  | +------+  +------+  +------+               | |
|          |  | AGV-01    AGV-02    AGV-03                 | |
|          |  | 192.168...192.168...robot-03...            | |
|          |  | SN:...    SN:...    SN:...                 | |
|          |  | megaCos...megaCos...megaCos...             | |
|          |  +---------------------------------------------+ |
+----------+--------------------------------------------------+
```

---

## 2. 视图模式

Robots 子界面支持两种视图模式，用户可通过工具栏右侧的切换按钮进行切换。

### 2.1 缩略图视图（Thumbnail / Grid View）—— 默认

- 以卡片网格形式展示机器人
- 每行最多 3 张卡片
- 卡片尺寸：约 280 x 180px
- 卡片内容：
  - 左上角复选框（用于批量选择）
  - 中央机器人图标占位（圆形灰色背景，内写 "Robot"）
  - 别名（加粗）
  - 地址 + 型号（同一行）
  - SN
  - megaCosmOS 版本

### 2.2 列表视图（List View）

- 以数据表格形式展示机器人
- 表格列：Checkbox、Alias、Address、Model、Robot SN、Things ID、megaCosmOS、Actions
- 每行底部有分隔线
- Actions 列包含 Details 和 Delete 按钮

### 2.3 视图切换按钮

位于工具栏最右侧：
- [Grid] 按钮：切换到缩略图视图，当前为缩略图时高亮（bg="#0f62fe", fg="white"）
- [List] 按钮：切换到列表视图，当前为列表时高亮（bg="#0f62fe", fg="white"）

两种模式显示的信息内容完全一致，只是布局不同。

---

## 3. 组件详细设计

### 3.1 工具栏（Toolbar）

位于内容区上方，从左到右依次为：

| 元素 | 类型 | 说明 |
|------|------|------|
| 搜索框 | TextInput | placeholder="Search by alias, address, model or SN..."，实时过滤 |
| Add Robot 按钮 | Button (primary) | 点击打开添加机器人模态框 |
| Batch Add 按钮 | Button (secondary) | 点击打开批量添加标签页 |
| Batch Delete 按钮 | Button (danger) | 有选中项时显示，显示选中数量 |
| Grid 按钮 | Button | 切换到缩略图视图 |
| List 按钮 | Button | 切换到列表视图 |

### 3.2 缩略图卡片（Thumbnail Card）

```
+------------------------+
| [x]              Robot |
|         (icon)         |
|                        |
| AGV-01                 |
| 192.168.1.101 | X100   |
| SN: SN123456           |
| megaCosmOS: 2.3.1      |
+------------------------+
```

卡片交互：
- 点击卡片任意位置（除 checkbox 外）：打开机器人详情模态框
- 点击 checkbox：切换选中状态，不影响卡片点击
- 悬停：边框颜色加深或添加阴影效果

### 3.3 数据表格（List View）

表格列定义：

| 列名 | 类型 | 可排序 | 说明 |
|------|------|--------|------|
| 选择框 | Checkbox | 否 | 每行一个，表头为全选复选框 |
| Alias | Text | 是 | 可内联编辑 |
| Address | Text | 是 | IP 地址或 mDNS 域名，只读 |
| Model | Text | 是 | 机器人型号，只读 |
| Robot SN | Text | 是 | 序列号，只读 |
| Things ID | Text | 是 | ThingsId，只读 |
| megaCosmOS | Text | 是 | 操作系统版本，只读 |
| Actions | 按钮组 | 否 | View Details、Delete |

### 3.4 空状态（Empty State）

当当前 Solution 下无机器人时展示：

- 中央展示插图
- 标题："No robots yet"
- 副标题："Add robots to this solution to manage them."
- 按钮："Add your first robot"（primary）

---

## 4. 模态框设计

### 4.1 添加机器人模态框（Add Robot Modal）

模态框标题："Add Robots"

使用 Tabs 组织两种添加方式：

#### Tab 1: Single

| 字段 | 组件 | 必填 | 说明 |
|------|------|------|------|
| Address | TextInput | 是 | placeholder="IP address or mDNS hostname" |
| Alias | TextInput | 否 | placeholder="Optional alias (defaults to address)" |

#### Tab 2: Batch

| 字段 | 组件 | 必填 | 说明 |
|------|------|------|------|
| Addresses | TextArea | 是 | placeholder="Enter one address per line..."，支持 alias 后缀（逗号分隔） |

### 4.2 机器人详情模态框（Robot Detail Modal）

模态框标题："Robot Details — {alias}"
尺寸：lg（最大宽度 960px）

使用 Tabs 组织信息：

#### Tab 1: Basic Info

可编辑字段：Alias、Model、Robot SN、Vendor ID、Product ID、Mainboard SN、Mainboard ID
只读字段：Address、Things ID、Main SOM ID

#### Tab 2: Other Info

`hardwareDeviceTree` 以 DataTable 展示（列：Name、Firmware、Hardware、SN、Hardware ID、Status）

#### Tab 3: Software Versions

分组展示：OS Versions、MCU Firmware、Actuator Firmware、Sensor Firmware

#### Tab 4: Hardware Versions

分组展示：Main Control、MCU Hardware、Actuator Hardware、Sensor Hardware

### 4.3 删除确认模态框

单台删除标题："Delete Robot"
批量删除标题："Delete N Robots"

内容：警告文本 + 机器人别名列表

---

## 5. 交互流程

### 5.1 切换视图模式

1. FAE 在工具栏点击 [Grid] 或 [List] 按钮
2. 系统切换视图模式并刷新展示
3. 当前选中的机器人在切换后保持选中状态
4. 视图模式偏好持久化到 localStorage

### 5.2 添加单台机器人

1. FAE 点击 "Add Robot" 按钮
2. 系统打开 Add Robot Modal，默认展示 Single Tab
3. FAE 输入 Address 和 Alias
4. FAE 点击 "Add"
5. 系统调用 POST /api/solutions/{solutionId}/robots
6. 系统关闭模态框，刷新当前视图，展示成功通知

### 5.3 批量添加机器人

1. FAE 点击 "Batch Add" 按钮
2. 系统打开 Add Robot Modal，默认展示 Batch Tab
3. FAE 在文本域中输入多个地址
4. FAE 点击 "Batch Add"
5. 系统调用 POST /api/solutions/{solutionId}/robots/batch
6. 系统关闭模态框，刷新当前视图，展示结果通知

### 5.4 查看/编辑机器人详情

1. FAE 点击缩略图卡片或表格行（或 "Details" 按钮）
2. 系统打开 Robot Detail Modal
3. FAE 可切换标签页查看各组信息
4. FAE 在 Basic Info 中修改可编辑字段
5. FAE 点击 "Save"
6. 系统调用 PUT /api/solutions/{solutionId}/robots/{robotId}
7. 系统刷新当前视图展示

### 5.5 删除/批量删除机器人

1. FAE 勾选复选框（卡片左上角或表格行首列）
2. 工具栏动态显示 "Batch Delete (N)" 按钮
3. FAE 点击删除按钮
4. 系统打开 Delete Confirm Modal
5. FAE 点击 "Delete"
6. 系统执行删除并刷新当前视图

---

## 6. 状态与样式

### 6.1 颜色规范

遵循 Carbon Design System 主题：

| 场景 | 颜色 Token |
|------|-----------|
| 页面背景 | `$ui-background` |
| 卡片/表格背景 | `$ui-01` |
| 悬停行背景 | `$hover-ui` |
| 选中行背景 | `$selected-ui` |
| 主按钮 | `$button-primary` |
| 危险按钮 | `$button-danger` |
| 在线状态 Tag | `$tag-background-green` |
| 离线状态 Tag | `$tag-background-red` |

### 6.2 间距规范

| 元素 | 间距 |
|------|------|
| 页面内边距 | 2rem |
| 工具栏与内容间距 | 1rem |
| 卡片间距 | 1.25rem |
| 表格行内边距 | 0.75rem 1rem |
| 模态框内容区内边距 | 1.5rem |

### 6.3 响应式

- 桌面端（>= 1056px）：缩略图 3 列 / 完整表格
- 平板端（672px - 1055px）：缩略图 2 列 / 隐藏部分表格列
- 移动端（< 672px）：缩略图 1 列 / 仅展示核心列

---

## 7. 异常状态

| 场景 | 处理方式 |
|------|---------|
| 无激活 Solution | 左侧导航栏禁用，主内容区提示 "Please select or create a solution first." |
| 加载机器人列表失败 | 展示 InlineNotification（kind="error"），提供 Retry 按钮 |
| 添加机器人失败 | 模态框内展示 InlineNotification（kind="error"） |
| 保存详情失败 | 模态框内展示 InlineNotification（kind="error"） |
| 删除失败 | 展示 ToastNotification（kind="error"） |
