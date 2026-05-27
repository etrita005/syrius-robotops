# 解决方案管理模块 — 软件设计文档

> 本文档承接《解决方案管理模块需求规格说明书》，对需求中涉及的技术实现进行设计细化。

---

## 1. 概述

本文档描述解决方案管理模块的内部接口设计、核心服务类结构、与对象存储层的交互方式，以及当前激活解决方案状态管理的设计方案。

---

## 2. 设计约束

- 所有持久化操作均通过 `playground/object_store` RESTful API 完成，禁止绕过对象存储直接操作文件系统。
- 模块内部使用 TypeScript + ES6 模块语法。
- 所有接口定义仅为设计阶段草案，实现时可根据实际情况调整参数和返回值。

---

## 3. 内部接口设计

### 3.1 解决方案服务接口（SolutionService）

负责解决方案的完整生命周期管理，对外提供语义化操作，内部映射为对象存储路径。

```typescript
interface SolutionMeta {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

interface CreateSolutionInput {
  id?: string;          // 可选；省略时自动生成
  name: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface SolutionService {
  create(input: CreateSolutionInput): Promise<SolutionMeta>;
  list(): Promise<SolutionMeta[]>;
  get(id: string): Promise<SolutionMeta | null>;
  update(id: string, patch: Partial<Omit<SolutionMeta, "id" | "createdAt">>): Promise<SolutionMeta>;
  remove(id: string): Promise<void>;
  clone(sourceId: string, newName: string): Promise<SolutionMeta>;
  exportToArchive(id: string, destinationPath: string): Promise<string>;
  importFromArchive(zipPath: string, conflictResolution: "overwrite" | "rename" | "cancel"): Promise<SolutionMeta>;
}
```

### 3.2 当前激活解决方案管理器（ActiveSolutionManager）

负责维护应用会话中的单一激活上下文，并提供状态变更订阅机制。

```typescript
interface ActiveSolutionManager {
  getActiveId(): string | null;
  setActiveId(id: string): Promise<void>;
  clear(): void;
  onChange(callback: (id: string | null) => void): () => void;
}
```

### 3.3 制品服务接口（ArtifactService）

负责全局制品的生命周期管理和引用计数维护。

```typescript
interface ArtifactMeta {
  id: string;
  fileName: string;
  size: number;
  checksum: string;
  contentType: string;
  createdAt: string;
  refCount: number;
  metadata: Record<string, unknown>;
}

interface ArtifactReference {
  artifactId: string;
  purpose: string;
}

interface ArtifactService {
  upload(filePath: string, metadata?: Record<string, unknown>): Promise<ArtifactMeta>;
  list(): Promise<ArtifactMeta[]>;
  get(artifactId: string): Promise<ArtifactMeta | null>;
  remove(artifactId: string): Promise<void>;
  incrementRefCount(artifactId: string): Promise<void>;
  decrementRefCount(artifactId: string): Promise<void>;
}
```

---

## 4. 对象存储路径映射

### 4.1 路径模板

| 操作 | HTTP 方法 | 对象存储路径 | Content-Type |
|------|----------|-------------|--------------|
| 创建/更新 meta | PUT | `/api/obs/v1/solutions/{id}/meta` | `application/json` |
| 读取 meta | GET | `/api/obs/v1/solutions/{id}/meta` | — |
| 列举全部解决方案 | GET | `/api/obs/v1/solutions` | — |
| 删除解决方案 | DELETE | `/api/obs/v1/solutions/{id}` | — |
| 子资源操作 | PUT/GET/DELETE | `/api/obs/v1/solutions/{id}/{namespace}/{resourceId}` | 按资源类型 |
| 上传制品文件 | PUT | `/api/obs/v1/artifacts/{artifactId}` | 按实际文件类型 |
| 上传/更新制品元数据 | PUT | `/api/obs/v1/artifacts/{artifactId}_meta` | `application/json` |
| 读取制品元数据 | GET | `/api/obs/v1/artifacts/{artifactId}_meta` | — |
| 列举全部制品 | GET | `/api/obs/v1/artifacts` | — |
| 删除制品 | DELETE | `/api/obs/v1/artifacts/{artifactId}` | — |

### 4.2 目录骨架初始化流程

创建解决方案时，需依次调用以下 PUT 请求预创建空目录（通过写入占位文件或依赖对象存储的自动目录创建机制）：

1. `PUT /api/obs/v1/solutions/{id}/meta` — 写入元数据
2. 对象存储会自动创建中间目录 `v1/solutions/{id}/`
3. 各子命名空间目录在首次写入该类型资源时由对象存储自动创建；若需在创建时预置，可写入 `.keep` 占位文件

全局制品目录 `v1/artifacts/` 为独立顶级命名空间，不隶属于任何解决方案。首次上传制品时，对象存储自动创建 `v1/artifacts/` 目录。

---

## 5. 核心类设计草案

### 5.1 SolutionServiceImpl

```
class SolutionServiceImpl implements SolutionService {
  - objectStoreBaseUrl: string
  + create(input: CreateSolutionInput): Promise<SolutionMeta>
  + list(): Promise<SolutionMeta[]>
  + get(id: string): Promise<SolutionMeta | null>
  + update(id: string, patch): Promise<SolutionMeta>
  + remove(id: string): Promise<void>
  + clone(sourceId: string, newName: string): Promise<SolutionMeta>
  + exportToArchive(id: string, destinationPath: string): Promise<string>
  + importFromArchive(zipPath: string, conflictResolution): Promise<SolutionMeta>
  - generateId(name: string): string
  - readMeta(id: string): Promise<SolutionMeta>
  - writeMeta(id: string, meta: SolutionMeta): Promise<void>
}
```

### 5.2 ActiveSolutionManagerImpl

```
class ActiveSolutionManagerImpl implements ActiveSolutionManager {
  - activeId: string | null
  - listeners: Set<(id: string | null) => void>
  - storageKey: string
  + getActiveId(): string | null
  + setActiveId(id: string): Promise<void>
  + clear(): void
  + onChange(callback): () => void
  - persist(): void
  - restore(): void
  - notify(): void
}
```

### 5.3 ArtifactServiceImpl

```
class ArtifactServiceImpl implements ArtifactService {
  - objectStoreBaseUrl: string
  + upload(filePath: string, metadata?): Promise<ArtifactMeta>
  + list(): Promise<ArtifactMeta[]>
  + get(artifactId: string): Promise<ArtifactMeta | null>
  + remove(artifactId: string): Promise<void>
  + incrementRefCount(artifactId: string): Promise<void>
  + decrementRefCount(artifactId: string): Promise<void>
  - computeChecksum(filePath: string): Promise<string>
  - findByChecksum(checksum: string): Promise<ArtifactMeta | null>
  - writeMeta(artifactId: string, meta: ArtifactMeta): Promise<void>
  - readMeta(artifactId: string): Promise<ArtifactMeta>
}
```

---

## 6. 关键时序设计

### 6.1 创建解决方案

```
FAE -> UI: 输入名称、描述、标签
UI -> SolutionServiceImpl: create(input)
SolutionServiceImpl -> SolutionServiceImpl: generateId(name)
SolutionServiceImpl -> ObjectStore: PUT /api/obs/solutions/{id}/meta
ObjectStore --> SolutionServiceImpl: 200 OK
SolutionServiceImpl --> UI: SolutionMeta
UI -> ActiveSolutionManager: setActiveId(id)
ActiveSolutionManager --> UI: 激活完成
```

### 6.2 切换当前激活解决方案

```
FAE -> UI: 选择另一解决方案并点击“切换”
UI -> ActiveSolutionManager: setActiveId(newId)
ActiveSolutionManager -> SolutionServiceImpl: get(newId) // 验证存在性
SolutionServiceImpl --> ActiveSolutionManager: SolutionMeta
ActiveSolutionManager -> ActiveSolutionManager: clear 旧缓存
ActiveSolutionManager -> ActiveSolutionManager: persist newId
ActiveSolutionManager -> ActiveSolutionManager: notify listeners
ActiveSolutionManager --> UI: onChange 回调触发
UI -> UI: 重载全部子功能视图
```

### 6.3 删除当前激活解决方案

```
FAE -> UI: 点击删除，完成两步确认
UI -> SolutionServiceImpl: remove(id)
SolutionServiceImpl -> ObjectStore: GET /api/obs/solutions/{id}/upgrade-packages
SolutionServiceImpl -> ObjectStore: GET /api/obs/solutions/{id}/maps
ObjectStore --> SolutionServiceImpl: 引用文件列表
SolutionServiceImpl -> ArtifactServiceImpl: decrementRefCount(artifactId) 对每个引用
ArtifactServiceImpl -> ObjectStore: PUT /api/obs/v1/artifacts/{artifactId}_meta (更新 refCount)
ObjectStore --> ArtifactServiceImpl: 200 OK
SolutionServiceImpl -> ObjectStore: DELETE /api/obs/solutions/{id}
ObjectStore --> SolutionServiceImpl: 204 No Content
SolutionServiceImpl --> UI: 删除成功
UI -> ActiveSolutionManager: clear()
ActiveSolutionManager -> ActiveSolutionManager: notify listeners(null)
UI -> UI: 重定向至解决方案选择器
```

---

## 7. 异常处理策略

| 异常场景 | 处理方式 |
|---------|---------|
| 对象存储无响应 | 重试 3 次（指数退避），最终向用户提示网络错误 |
| 删除过程中部分子资源失败 | 记录详细错误日志，向用户报告未删除成功的路径列表 |
| 克隆中途失败 | 清理已创建的目标目录，确保不产生残缺解决方案 |
| 导入 ZIP 结构不合法 | 在解压前进行结构预检，不写入任何数据到对象存储 |
| 制品被引用时删除 | 拒绝删除，提示当前引用数量及引用来源 |
| 上传重复校验和 | 返回已有制品，不重复存储文件 |
| 引用计数不一致 | 提供后台修复工具或定期全量扫描校正 |

---

## 8. 待设计项

1. ZIP 流式打包/解压的具体库选型与内存控制策略。
2. 对象存储客户端的统一封装（是否需要共享 HTTP 连接池、超时配置等）。
3. 克隆操作的原子性实现：是否需要先复制到临时目录再整体重命名；克隆时如何批量递增制品引用计数。
4. 本地设置持久化的具体机制（Electron store / localStorage / 其他）。
5. 制品引用计数的原子性保证：是否需要引入分布式锁或事务机制，防止并发操作导致 refCount 不一致。
6. 制品去重策略的校验和算法选择（SHA-256 vs xxHash vs MD5），权衡安全性与计算速度。
