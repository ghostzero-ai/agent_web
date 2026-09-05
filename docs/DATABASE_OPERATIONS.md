# 数据库迁移操作手册

本文档定义 Sprint 1.1 起 PostgreSQL Schema 的生成、升级、验证与回滚流程。应用目前仍由浏览器 localStorage 提供聊天数据；数据库会在 Sprint 1.2 接入 Repository/API，并在 Sprint 1.4 导入旧数据。

## 1. 环境准备

运行迁移命令需要一个可连接的 PostgreSQL 数据库。Docker Compose 自托管拓扑属于 Sprint 1.5，本阶段可使用本机 PostgreSQL 或临时开发数据库。

在 `web/` 目录中：

```powershell
Copy-Item .env.example .env.local
```

编辑 `.env.local` 中的 `DATABASE_URL`。该文件被 Git 忽略，禁止把真实密码提交到仓库；`.env.example` 只能保存无效示例凭据。

## 2. 常用命令

```powershell
# 从 lib/db/schema.ts 生成新的前向迁移
npm run db:generate

# 检查 Drizzle migration 元数据一致性
npm run db:check

# 按文件名顺序应用所有待执行迁移
npm run db:migrate

# 回滚最后一条已应用迁移
npm run db:rollback

# 在内存 PostgreSQL 兼容环境执行建库、幂等、回滚和漂移测试
npm test -- databaseMigrations.test.ts
```

`db:migrate` 会创建 `app_internal.schema_migrations`，记录迁移文件名、SHA-256 校验和与执行时间。已应用 SQL 被修改时命令会拒绝继续，避免数据库历史与 Git 历史悄悄分叉。

## 3. 新迁移规范

1. 只修改 `web/lib/db/schema.ts`，不要使用 `drizzle-kit push` 直接改变共享数据库。
2. 执行 `npm run db:generate`，审阅 `web/drizzle/<id>.sql`。
3. 在 `web/drizzle/rollback/<id>.sql` 创建同名回滚文件。回滚顺序必须与前向依赖相反。
4. 用 `--> statement-breakpoint` 分隔需要逐条执行的 SQL。
5. 依次运行 `npm run db:check`、数据库迁移测试、TypeScript、Lint 与 Build。
6. 已经在任一数据库执行过的迁移不可改写；修正必须新增下一条迁移。

## 4. 事务与并发

- 每条迁移及其历史记录写入处于同一事务；失败时该条迁移整体撤销。
- 执行期间对迁移历史表加排他锁，两个进程不会同时应用同一版本。
- 回滚同样在事务和排他锁内执行，一次只回退最新版本。
- 前向迁移默认应保持兼容；涉及删列、改类型或大量数据重写时，需要先备份并单独编写演练方案。

## 5. 当前 Schema 边界

- 主键使用 UUID，时间使用 `timestamptz`，API 层未来统一输出 ISO 8601。
- `users` 即使在单用户阶段也保留，避免未来迁移云端时改写所有外键。
- `messages.parent_message_id` 使用自引用外键，真实保存对话树，而不是把版本塞入 JSON。
- `conversations.active_leaf_message_id` 当前不设循环外键；Sprint 1.2 的 Repository 必须在事务中验证活动叶节点属于同一会话。
- JSONB 仅用于结构开放的 `citations`；角色、状态和模式均使用 PostgreSQL Enum。

## 6. 回滚注意事项

回滚可能删除表、列或数据，执行前必须确认目标数据库并做好备份。`db:rollback` 只回滚一条；成功后会移除相应历史记录。若代码已依赖新 Schema，应同时将应用代码切回兼容版本。

当前首条 rollback 会删除 User/Conversation/Message 三张业务表及对应 Enum，只适用于开发基线演练，不应在含真实数据的环境直接执行。
