# ADR-025：单用户 Conversation Repository 与事务化树 API

## 状态

Accepted

## 背景

Sprint 1.1 只建立了 Schema 和迁移。现有 Chat 领域模型已经是消息树，但浏览器 localStorage 仍是唯一数据来源。后续服务端模型、定时任务和跨设备访问需要一个统一的数据访问边界，不能让 Route Handler、Worker 和未来插件各自拼接 SQL。

数据库没有为 `active_leaf_message_id` 建立指向 messages 的循环外键，因此应用层必须可靠保证活动节点归属和树语义。

## 决策

### 1. Repository 是唯一领域写入边界

- Route Handler 不直接操作 Drizzle 表。
- `ConversationRepository` 负责固定本地用户、会话 CRUD、消息追加和活动分支切换。
- Repository 返回数据库领域记录；API 层负责校验、HTTP 状态和序列化。

### 2. 单用户使用稳定身份锚点

- 使用固定 UUID `00000000-0000-4000-8000-000000000001`。
- 初始化采用主键 `ON CONFLICT DO NOTHING`，重复请求或并发启动不会创建多个本地用户。
- API 不接收 `userId`；当前所有查询都强制限定到本地用户。

### 3. 树写入与活动分支更新必须事务化

- 追加 Message 前用行锁读取 Conversation。
- 非空父节点必须存在且属于同一 Conversation。
- 写入 Message、更新 `active_leaf_message_id`、`updated_at` 和 `version` 属于同一事务。
- 手动切换活动分支时，目标必须属于同一 Conversation 且没有子节点；非空 Conversation 不允许清空活动叶节点。
- 客户端必须提供 `expectedVersion`；版本过期返回稳定的 `VERSION_CONFLICT`。

### 4. API 使用 `/api/v1`、Zod 和统一错误格式

- Next.js Route Handler 固定 Node.js Runtime，并明确禁止缓存。
- 请求正文和路径 UUID 使用 Zod 校验，未知字段被拒绝。
- 所有响应带 `X-Request-Id`；错误只返回稳定 code，不泄露数据库异常。
- 会话详情返回完整消息树，而非只返回活动路径，保证分支可以恢复。

### 5. 本 Sprint 不切换 Chat 数据源

Repository/API 与现有 Browser Backend 并行存在。Sprint 1.3 先迁移模型调用，Sprint 1.4 再通过显式、幂等的导入流程处理已有 localStorage，避免无提示上传或重复记录。

## 备选方案

1. Route Handler 直接调用 Drizzle：文件更少，但事务和用户隔离规则会迅速重复。
2. 立即改造 Chat 页面：能更早展示数据库，但会把 API、模型调用和旧数据迁移混在一起，回归面过大。
3. 使用随机“第一个用户”：首次请求并发时可能产生多个用户，未来迁移也缺少稳定身份。
4. 只依赖数据库外键：现有无循环外键的活动叶列无法验证归属和叶节点语义。
5. 省略乐观锁：两个页面切换分支时会发生最后写入静默覆盖。

## 后果

### 正面

- 同一服务端的不同客户端可以读取同一 Conversation/Message 数据。
- 对话树写入具备事务原子性，跨会话父节点和伪叶节点被拒绝。
- Route、未来 Worker 与模型 Runtime 可以复用同一 Repository 规则。
- API 输入、错误码、请求追踪和缓存策略有稳定契约。

### 代价

- 当前仍同时维护 localStorage 与数据库两个数据世界，直到 Sprint 1.4。
- 固定用户只适用于个人部署，未来登录系统必须引入真正的认证上下文。
- 未分页的完整消息树只适合当前数据规模。
- 没有认证的端点不得直接暴露到公网；Sprint 1.5 部署必须提供私有访问边界。
