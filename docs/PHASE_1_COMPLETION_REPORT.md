# Phase 1 完成报告：服务端与数据基础

报告日期：2026-09-06  
范围：Sprint 1.1–1.5  
结论：工程实现、自动化测试、文档、分 Sprint 提交与远端推送均已完成；真实 Docker 环境演练仍有外部前置条件。

## 1. 结果摘要

Phase 1 已把项目从“浏览器 localStorage + 浏览器直连模型”的单页原型，推进为具有以下基础的单用户服务端应用：

- PostgreSQL/Drizzle 版本化 Schema、前向迁移、单步回滚和漂移检测。
- Conversation/Message Repository 与严格 `/api/v1`，消息真实保存为父子树。
- 服务端 OpenAI-compatible Model Provider、同源 SSE、增量渲染和取消传播。
- 用户明确确认的 localStorage 旧会话导入，树保真和来源收据去重。
- Chat 全面切换 PostgreSQL 事实源，刷新和连接同一服务端的设备可读取同一数据。
- Docker Compose 自托管制品、readiness 健康检查、迁移入口和跨平台备份恢复脚本。

这意味着 Phase 2 可以直接在可靠数据库和服务端运行边界上建设 Task/TaskRun，而不再依赖浏览器定时器或本地会话事实。

## 2. Sprint 交付与提交

| Sprint | 交付 | 功能提交 | 文档/记录提交 |
|---|---|---|---|
| 1.1 | PostgreSQL + Drizzle + migration 基线 | `96649c8` | `c61cbea` |
| 1.2 | Conversation/Message Repository 与 API | `9e522d0` | `2c8a6f5` |
| 1.3 | 服务端 Model Provider 与 SSE | `563097e` | `5c4123c` |
| 1.4 | 显式旧数据导入与服务端 Chat | `46231b7` | 本报告封版提交 |
| 1.5 | Docker Compose 自托管基线 | `c42bbdc` | 本报告封版提交 |

Sprint 1.4 与 1.5 已分别提交并推送到 `origin/main`；本报告与最终进度文档在单独的文档提交中封版。

## 3. 最终架构

```text
Browser / future PWA or APK
  ├── Conversation API client
  ├── Legacy import confirmation
  └── Internal model SSE client
            │
            ▼
Next.js Web + /api/v1
  ├── Conversation API ──> Conversation Repository
  ├── Import API ────────> Legacy Import Repository
  ├── Model Stream API ──> OpenAI-compatible Provider
  └── Health API
            │
            ▼
PostgreSQL
  ├── users
  ├── conversations
  ├── messages (parent_message_id tree)
  ├── conversation_imports (idempotency receipt)
  └── app_internal.schema_migrations
```

部署层由 Compose 提供私有 PostgreSQL、命名卷、Web 健康依赖与启动迁移。当前仍是模块化单体，没有引入微服务、队列、登录、多用户或插件运行时。

## 4. 数据与安全边界

### 已建立

- API Key 只从服务端环境读取；浏览器旧 key/base/model 键会被删除。
- Model 状态只返回 Origin、模型名和缺失字段，不返回密钥或含凭据 URL。
- 数据 API 不接受客户端 `userId`，固定映射到本地用户。
- Zod 严格拒绝未知字段、非法枚举、超限内容和不合法 UUID/树。
- Repository 在事务中验证父节点归属、叶节点和 Conversation version。
- Provider 内部错误与数据库错误不直接返回客户端。
- Compose 不公开 PostgreSQL 端口，Web 默认只绑定 localhost。
- `.env.local`、`.env.selfhost`、备份目录和 Docker build secrets 均被排除。

### 尚未建立

- 登录、会话认证、CSRF/设备身份、多用户行级隔离。
- 公网 TLS、反向代理、速率限制和安全响应头基线。
- Secret manager、密钥轮换和集中审计日志。

因此当前系统可以本机使用；在身份认证完成前不能直接暴露到公网。即使只在局域网绑定 `0.0.0.0`，也必须限制防火墙和网络来源。

## 5. 数据迁移与回滚

- `0000_easy_joystick` 建立 users/conversations/messages 和 Enum。
- `0001_perfect_typhoid_mary` 建立 conversation_imports、外键和唯一收据。
- 两条迁移均有同名 rollback，并由 PGlite 执行真实 PostgreSQL SQL 回归。
- 导入为逐会话事务：一个会话的 Conversation、Message tree、active leaf 和 receipt 共同成功或失败。
- 删除导入会话会级联删除收据，允许仍有本地源时重新导入。
- `0001` 回滚只删除收据，不删除已导入会话；因此回滚后重复导入风险必须人工考虑。

## 6. 最终验证证据

| 检查 | 结果 |
|---|---|
| Vitest | 17 个文件，75/75 通过 |
| PGlite migration/repository/API | 通过，覆盖迁移/回滚/漂移、树事务、分支、导入幂等 |
| TypeScript | `npx tsc --noEmit --pretty false` 通过 |
| ESLint | `npm run lint` 通过 |
| Production Build | `npm run build` 通过，11 个 App Router 路由/页面生成成功 |
| Drizzle | `db:check` 通过；`db:generate` 无未生成变化 |
| Edge E2E | 3/3 通过且测试进程正常退出 |
| Dependency audit | 离线 prune 审计 542 包，0 漏洞；package-lock 未变化 |
| Compose syntax | PyYAML 解析成功，服务为 postgres/web |
| PowerShell scripts | AST 解析成功，无语法错误 |
| Docker runtime | 未执行：当前机器没有 Docker |
| POSIX shell runtime | 未执行：WSL/Bash 被操作系统拒绝启动 |

## 7. 额外审查发现

### 阻断问题

代码层未发现 P0/P1 功能缺陷。当前仅剩 Docker 实机部署演练这一外部验证条件。

### 已知限制与技术债

1. **公网安全（高）**：无鉴权，必须保持 localhost/可信私网；Phase 2 前后应单独排身份方案。
2. **容器实机演练（高）**：Compose、重启恢复和 backup/restore 只有静态/语法验证，必须在安装 Docker 的机器做一次完整演练。
3. **流式持久化（中）**：assistant 只在完整生成后写库；进程崩溃时会保留 user 消息但丢失未完成回复。未来可用 `streaming/failed` 状态持久化 Run。
4. **会话加载扩展性（中）**：当前先列会话再逐个读取完整树，个人小数据量可接受；增长后应列表仅加载摘要并按选中会话懒加载/分页。
5. **旧 Runtime 残留（中）**：Phase 0 浏览器 backend/dispatcher 与 localStorage memory 仍保留供测试和后续迁移，但 Chat 已不调用其会话 Store。Phase 2 不应把它误当可靠后台任务。
6. **导入性能（低）**：最多 100 会话时按来源和消息顺序查询/写入，偏向可读与事务正确；真实大数据导入前可批量优化。
7. **镜像体积（低）**：为在容器启动时执行 TypeScript 迁移脚本，运行镜像暂时保留完整 node_modules；稳定后可编译迁移 runner 并只复制 production deps。
8. **字体网络噪声（低）**：受限网络下 Next 开发服务器会为 Google Geist 使用 fallback；可改为自托管字体以提高离线确定性。

## 8. localStorage 最终状态

| 键 | Phase 1 结束状态 |
|---|---|
| `agent_api_key` | 启动时删除，不再使用 |
| `agent_api_base_url` | 启动时删除，不再使用 |
| `agent_api_model` | 启动时删除，不再使用 |
| `agent_chat_sessions` | 只作为显式迁移源；成功导入后删除，不再接收新会话 |
| `agent_chat_messages` | 仅旧格式迁移入口，规范化后删除 |
| Memory 相关键 | 仍是 Phase 0 本地原型，后续 Phase 5 迁移 |

## 9. Phase 2 建议顺序

1. Sprint 2.1：Task/TaskRun Schema、状态机、CRUD API 与管理 UI；普通提醒不调用模型。
2. Sprint 2.2：数据库 claim、lease、唯一 run key、并发幂等与补偿扫描。
3. Sprint 2.3：独立 Worker 执行普通提醒并写 Durable Inbox，页面关闭后仍可产生结果。
4. Sprint 2.4：Web Push、安静时段、频控与失败可重试 Delivery。
5. Sprint 2.5：Agent Prompt Task，复用服务端 Provider 并记录每次 Run。

正式开始 2.1 前，先在一台有 Docker 的机器完成一次 Phase 1 部署演练，并决定当前个人使用是否需要先加最小登录/设备令牌。不要把浏览器 `runTask` 或 `setTimeout` 直接扩展为后台调度器。

## 10. 验收结论

从代码、数据契约、测试、文档和 Git 交付角度，Phase 1 的设计目标已经实现。远端 `main` 已包含两个独立功能提交；仍需在有 Docker 的主机执行启动、重启、备份和还原演练，这一项不应被包装为“已通过”。完成实机演练后，Phase 1 才具备完整的运行环境证据。
