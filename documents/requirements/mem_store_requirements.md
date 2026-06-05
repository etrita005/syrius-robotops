# MemStore 模块最终技术需求清单

## 一、核心基础能力需求

- 提供前端可直接调用的 KV 读写能力，支持对象型数据存取、删除，底层基于内存 LRU 策略做容量淘汰
- 支持单 Key 独立生命周期配置，每条缓存数据可自定义不同 TTL 过期时长，超时自动失效清理
- 缓存数据全部内存托管，无需部署 Redis、无需部署消息队列，轻量化无中间件依赖
- MemStore 为独立模块，不与任何业务项目耦合；模块不实现单例模式，由调用者决定实例化方式

## 二、缓存属性与上下文需求

- 每个 cache 在创建时可指定一个只读属性 map（properties），创建后不可修改
- 属性 map 用于存储与缓存条目关联的元数据，例如 solutionId、robotId、taskFlowSpec 等
- 将 taskFlowSpec 作为属性 map 中的一个属性存储，实现与任务流引擎的解耦
- 前端能够通过接口同时获取 cache 值和属性 map
- 每个 cache 提供一个可读写的上下文 map（context），供事件处理器在运行过程中读写，用于在事件处理过程中注入和传递上下文信息

## 三、缓存列表与过滤需求

- MemStore 提供列出符合属性过滤条件的 cache 列表功能
- 用户可传入一个包含若干属性的 map 作为过滤条件
- MemStore 遍历所有 cache，逐个比对属性 map 中的每个键值对，返回所有完全匹配的 cache 列表
- 支持不传过滤条件时列出全部 cache

## 四、自动刷新触发能力需求（通过事件接口解耦，不自行执行业务数据计算）

- 支持单 Key 自定义预到期通知能力：缓存即将过期时触发 onUpdate 事件
- 支持缓存未命中触发刷新：缓存不存在或已失效时触发 onUpdate 事件
- 支持单 Key 自定义周期定时刷新：按配置的 Cron 定时规则触发 onUpdate 事件
- 支持外部主动触发指定 cache 更新：通过接口触发 onUpdate 事件
- 所有刷新请求统一通过 CacheEventHandler 的 onUpdate 方法处理，由调用者的实现类负责执行具体的数据获取逻辑

## 五、事件接口需求

- MemStore 中的 cache 具有数据生命周期事件：onCreated、onUpdate、onDeleted
- 事件接口定义为 CacheEventHandler，包含三个方法：onCreated、onUpdate、onDeleted
- 事件参数至少包含触发事件的 cache 完整信息（key、value、properties、context、config 等）
- onCreated：cache 创建时触发
- onUpdate：周期刷新、预到期刷新、缓存未命中刷新、手动触发刷新时触发（表示"刷新请求"）
- onDeleted：cache 因 TTL 过期或被显式删除时触发
- 在创建 MemStore 实例时，调用者需传入实现 CacheEventHandler 接口的类实例
- MemStore 在工作过程中，当 cache 产生事件时，调用该实例对应的方法
- updateCache（由 handler 调用写回数据时）触发 onValueChanged 事件，由调用者决定如何处理（如 SSE 广播），不触发 onUpdate 方法
- onValueChanged：缓存值被 updateCache 更新时触发，调用者在此实现 SSE 广播等副作用

## 六、前端实时推送能力需求

- MemStore 自身不实现 SSE，SSE 由调用者通过 CacheEventHandler 的 onValueChanged 和 onDeleted 方法实现
- SSE 推送统一由 `SseManager`（`src/backend/src/services/sseManager.ts`）负责，详见 `documents/requirements/sse-manager.md`
- MemStore 不再提供独立的 SSE 辅助类（原 `MemStoreSseManager` 已废弃），调用者应在 CacheEventHandler 实现中调用 `sseManager.broadcast(...)`
- 基于 Hono 原生 SSE 实现长连接订阅，前端通过统一端点 `GET /api/sse` 订阅所有事件（按事件名命名空间区分模块）
- 后端任务引擎完成数据更新、回调模块刷新缓存后，通过 onValueChanged 事件自动推送最新数据至所有订阅前端

## 七、动态资源管理需求

- 前端新增缓存 Key 时需指定配置（TTL、Cron、预警时长），可选指定初始值和属性 map
- 删除缓存 Key 时，同步清理对应缓存数据、元数据、定时任务、预警记录，无残留脏资源
- 支持动态关闭单 Key 定时刷新、预预警能力，支持动态修改 TTL、Cron、提前预警配置

## 八、接口对等需求

- MemStore 提供的每一个基于 HTTP 的请求接口，都应有对等数量的同语义函数接口
- MemStore 提供的每一个函数接口，都应有对等数量的同语义 HTTP 请求接口
- 设计文档中需以列表形式描述 HTTP 接口与函数接口的对应关系

## 九、模块完善优化建议（非原始需求，为生产稳定性补强）

- 增加刷新防抖机制：防止同一 Key 被缓存缺失、预到期、定时多路径并发重复触发事件
- 拆分读写接口：区分「前端新建缓存接口」和「内部更新缓存接口」，职责隔离
- 增加缓存元数据查询接口，可实时查看 Key 的 TTL、预警时长、Cron 配置、定时状态
- SSE 连接池自动清理僵尸连接，杜绝内存泄漏，前端支持断线自动重连适配

## 十、模块技术约束

- 技术栈：纯 Hono + lru-cache + toad-scheduler，零 Redis、零 BullMQ 依赖
- 业务计算收口：MemStore 不执行任何业务逻辑，通过 CacheEventHandler 事件接口将数据获取逻辑完全交由调用者实现
- 部署形态：单机内存架构，轻量化、低运维成本
