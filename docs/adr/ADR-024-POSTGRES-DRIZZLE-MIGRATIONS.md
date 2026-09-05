# ADR-024：PostgreSQL、Drizzle 与显式可回滚迁移

## 状态

Accepted

## 背景

Phase 0 的聊天数据只存在浏览器 localStorage，无法支持跨设备访问、可靠定时任务、后台 Worker、审计和未来多用户迁移。Phase 1 需要一个服务端事实来源，同时保留可读 SQL，便于学习、审阅与故障恢复。

Drizzle Kit 能从 TypeScript Schema 生成前向 SQL，但当前没有采用自动生成 down migration 的稳定工作流。直接依赖 `push` 会绕过仓库中的版本历史，也无法满足本项目的明确回滚验收。

## 决策

### 1. PostgreSQL 是服务端事实数据库

- 使用 PostgreSQL 的事务、UUID、Enum、JSONB、外键与后续任务锁能力。
- 单用户阶段仍保留 `users` 表和 `user_id`，以免扩展多用户时重构所有领域表。
- 数据库时间使用 `timestamptz`；应用/API 边界未来统一为 UTC ISO 8601。

### 2. Drizzle Schema 是结构源，SQL 是部署制品

- `web/lib/db/schema.ts` 定义类型化 Schema。
- Drizzle Kit 生成并校验 `web/drizzle/*.sql` 和快照元数据。
- 禁止把 `drizzle-kit push` 作为共享或生产环境部署方式。

### 3. 回滚 SQL 显式编写并隔离存放

- 每个前向迁移必须有 `web/drizzle/rollback/` 下的同名文件。
- 自定义轻量 Runner 只加载 `web/drizzle/` 根目录的前向 SQL，因此 rollback 不会被误当作升级执行。
- 每条 up/down 迁移在单一事务中执行，并用迁移历史表排他锁串行化。
- `app_internal.schema_migrations` 保存文件名、SHA-256 和执行时间；已执行文件发生漂移时拒绝继续。

### 4. 最小领域 Schema

- `users`：单用户身份锚点及未来云端迁移边界。
- `conversations`：标题、模式、摘要、活动叶节点、版本与时间。
- `messages`：角色、状态、父消息、模型、引用与创建时间。
- `parent_message_id` 使用数据库自引用外键。
- `active_leaf_message_id` 暂不建立指向 messages 的循环外键；Sprint 1.2 Repository 负责在事务中验证它属于同一会话。

### 5. 无本机 PostgreSQL 时仍执行 SQL 集成测试

测试使用 PGlite 在进程内运行 PostgreSQL 兼容引擎，执行仓库中的真实 SQL，覆盖首次建库、重复升级、单步回滚、回滚后重建、默认值和漂移拒绝。连接真实 PostgreSQL 的运维验证仍在具备数据库环境时执行，Docker Compose 标准环境留在 Sprint 1.5。

## 备选方案

1. SQLite：本地简单，但任务并发锁、未来云端和 PostgreSQL 迁移会产生第二套语义。
2. Prisma：迁移与工具成熟，但本项目希望更直接学习和审阅 SQL，且既定路线选择 Drizzle。
3. `drizzle-kit push`：原型快速，但缺少可审阅、可复现的部署历史。
4. 只做前向迁移：生产中常见，但不满足本 Sprint 的显式回滚目标。
5. 为活动叶节点立即增加循环外键：完整性更强，但引入建表、删除与级联循环；先在 Repository 事务中保证，后续可用复合约束加强。

## 后果

### 正面

- Schema、SQL、类型与 Git 历史可以共同审阅。
- 升级和回滚具有事务边界、并发保护与漂移检测。
- 对话分支能自然映射到独立消息节点。
- 单用户笔记本和未来云端可复用同一 PostgreSQL 迁移序列。

### 代价

- 每次 Schema 变化都要人工审阅并维护 down SQL。
- PGlite 不能替代真实 PostgreSQL 的部署、性能和扩展验证。
- 活动叶节点一致性暂时依赖下一 Sprint 的 Repository，而非数据库循环外键。
