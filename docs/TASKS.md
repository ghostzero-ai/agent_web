# Task/TaskRun 任务系统

Sprint 2.1–2.4 建立任务模型、数据库调度、Durable Inbox 与系统 Push；Sprint 2.5 增加 Agent Prompt Task。当前版本在网页关闭后仍能执行普通提醒或调用服务端模型，把结果保存到应用内收件箱，并向已授权设备尝试发送通知。

## 1. 使用方式

1. 执行数据库迁移：在 `web/` 运行 `npm run db:migrate`。
2. 推荐用仓库根目录的 Docker Compose 同时启动 Web、Worker 和 PostgreSQL；本机开发也可分别启动 Web 与 `npm run worker:reminders`。
3. 访问 `/tasks` 创建、编辑、暂停、恢复或删除任务，访问 `/inbox` 查看执行结果，访问 `/notifications` 启用系统通知并管理安静时段和设备。

当前支持固定单用户的 `reminder` 与 `agent_prompt`。AI 定时任务必须填写任务要求，并使用 `/api-key` 中保存的服务端模型配置。可选时间规则：

| 类型 | 输入 | 含义 |
|---|---|---|
| `once` | 带时区的 ISO 8601 `runAt` | 在未来某个时刻执行一次 |
| `daily` | `HH:mm` | 每天在北京时间执行 |
| `weekly` | `weekday` 1–7 + `HH:mm` | 每周一至周日的北京时间执行 |

第一版固定使用 `Asia/Shanghai`。浏览器的 `datetime-local` 值会显式按 UTC+8 转成 ISO 字符串，因此手机和电脑处于不同时区时不会依赖设备默认时区。

## 2. 数据模型

### `scheduled_tasks`

保存用户意图和下一次计划时间：类型、标题、任务要求、结构化时间规则、时区、`next_run_at`、状态与乐观锁版本。`active` 任务必须具有 `next_run_at`；`agent_prompt` 必须具有非空 prompt；暂停任务会清空下一次时间。

### `task_runs`

保存每次计划执行的独立事实：计划时间、认领者、租约、尝试次数、执行状态、结果、错误和通知时间。`(task_id, scheduled_for)` 唯一约束是防止同一次计划被重复创建的最后一道数据库防线。

删除任务会级联删除其 Run。编辑或暂停任务会把尚未完成的旧 Run 标为 `cancelled`，防止 Worker 执行过期内容。

### `inbox_items`

保存已发生提醒或 AI 结果的来源、标题、正文快照、计划发生时间和已读状态。每个 TaskRun 最多生成一条 InboxItem。删除源 Task/TaskRun 后外键设为 null，但快照继续保留，避免历史结果随任务清理而消失。

## 3. HTTP API

所有成功响应使用 `{ "data": ... }`，错误使用稳定的 `{ "error": { code, message, retryable, requestId } }`。响应设置 `Cache-Control: no-store` 和 `X-Request-Id`。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/tasks` | 列出任务 |
| `POST` | `/api/v1/tasks` | 创建任务 |
| `GET` | `/api/v1/tasks/:id` | 读取任务 |
| `PATCH` | `/api/v1/tasks/:id` | 完整更新、暂停或恢复任务 |
| `DELETE` | `/api/v1/tasks/:id` | 删除任务 |
| `GET` | `/api/v1/inbox?filter=all|unread|read` | 按状态列出提醒 |
| `PATCH` | `/api/v1/inbox/:id` | 标为 `read` 或 `unread` |
| `DELETE` | `/api/v1/inbox/:id` | 删除提醒 |
| `GET` | `/api/v1/push/config` | 读取 Push 公钥、偏好与脱敏设备列表 |
| `POST` | `/api/v1/push/subscriptions` | 保存或更新浏览器订阅 |
| `DELETE` | `/api/v1/push/subscriptions/:id` | 移除一台设备 |
| `PATCH` | `/api/v1/push/preferences` | 更新总开关与安静时段 |

创建每日提醒示例：

```json
{
  "title": "复习英语",
  "kind": "reminder",
  "prompt": "背诵今天的 20 个单词",
  "schedule": { "type": "daily", "time": "20:00" }
}
```

创建 AI 定时任务示例：

```json
{
  "title": "每日学习总结",
  "kind": "agent_prompt",
  "prompt": "生成一份今天值得复习的知识清单，并提出一个思考问题",
  "schedule": { "type": "daily", "time": "21:00" }
}
```

更新请求必须带客户端最后读取到的版本：

```json
{
  "title": "复习英语",
  "kind": "reminder",
  "prompt": "背诵今天的 20 个单词",
  "schedule": { "type": "daily", "time": "21:00" },
  "status": "active",
  "expectedVersion": 2
}
```

版本过期返回 HTTP 409 `VERSION_CONFLICT`，页面会重新读取列表并要求用户再次确认操作。一次性时间必须在服务端当前时间之后。

## 4. 安全与当前边界

- API 不接受 `userId`、`nextRunAt` 或任意任务状态；`kind` 只允许 `reminder`/`agent_prompt`，后者必须具有非空 prompt。
- Zod 使用严格对象校验，拒绝未知字段、非法 UUID、错误日期、越界星期和非法时间。
- 数据库错误不会返回连接信息或内部异常；公开错误仅暴露稳定错误码。
- 当前没有应用登录鉴权，只能通过 localhost 或 Tailscale 可信私网访问，禁止使用 Funnel 公开暴露。
- Worker 日志不输出任务标题、正文、数据库连接串或 API Key；收件箱使用安全 Markdown/KaTeX 渲染，不启用原始 HTML。
- 页面关闭不影响 Worker；但笔记本关机或休眠时无法执行。恢复后重复任务只补偿一次，避免提醒风暴。
- Inbox 是提醒事实来源，Web Push 只是可失败的提示渠道；页面打开时 `/inbox` 每 15 秒自动刷新。
- 锁屏 Push 使用通用文案，不包含任务标题、正文或 prompt；完整订阅与 VAPID 私钥使用主密钥加密存库。
- 新设备不会补推订阅前的历史 InboxItem；临时错误会重试，404/410 会自动隔离失效订阅。

## 5. Scheduler Claim

在 `web/` 中执行一次扫描：

```text
npm run scheduler:claim
```

可选环境变量：

| 变量 | 默认值 | 限制 |
|---|---:|---|
| `SCHEDULER_WORKER_ID` | 主机名 + PID | 1–200 字符 |
| `SCHEDULER_BATCH_SIZE` | `20` | 1–100 |
| `SCHEDULER_LEASE_MS` | `60000` | 5000–900000 毫秒 |

一次扫描先回收租约到期的 `claimed/running` Run，再锁定到期的 `active` Task。认领使用 `FOR UPDATE SKIP LOCKED`，因此多个 Worker 不会等待同一行；`(task_id, scheduled_for)` 唯一索引是第二道幂等防线。创建 Run、推进重复任务的 `nextRunAt` 或完成单次 Task 均处于同一事务。

迟到的每日/每周任务只生成一个补偿 Run，并把下一次计划推进到当前时间后的第一个规则时间，避免电脑关机数日后产生补发风暴。Task 推进使用整数版本护栏，不比较经 JavaScript 往返后可能丢失微秒精度的 PostgreSQL 时间。

Run 的 `workerId + attempt + 未过期 lease` 构成 fencing token。旧 Worker 在 Run 被重新认领后无法 start、续租或写入终态。命令日志不包含任务标题、提醒正文、数据库连接串或 API Key。

## 6. Reminder Worker 与 Durable Inbox

Docker Compose 的 `worker` 服务默认每 5 秒扫描一次，使用 Scheduler Claim 领取最多 20 个 Run。普通提醒无需调用模型；Agent Prompt Task 直接复用服务端 Credential Vault 与 OpenAI-compatible Provider。AI prompt 作为 `user` 消息发送，固定执行规则才是 `system` 消息。

同批 Run 并发进入执行，避免长模型调用耗尽其他 Run 的租约。AI 生成期间约每个租约三分之一周期续租，并在写结果前再次续租。临时 Provider 错误保留非终态并在租约过期后接管；配置缺失、空输出或超长输出等永久错误写为 `failed`。成功结果与 Run 终态在同一事务保存，最多 100,000 字符。

可选环境变量：

| 变量 | 默认值 | 限制 |
|---|---:|---|
| `REMINDER_WORKER_ID` | 主机名 + PID | 可留空自动生成 |
| `REMINDER_POLL_INTERVAL_MS` | `5000` | 1000–300000 毫秒 |
| `SCHEDULER_BATCH_SIZE` | `20` | 1–100 |
| `SCHEDULER_LEASE_MS` | `60000` | 5000–900000 毫秒 |

`docker compose --env-file .env.selfhost ps` 应同时显示 `postgres`、`web` 与 `worker`。数据库还原脚本会同时停止 Web 和 Worker，避免还原期间继续写入。

## 7. Web Push 投递

同一个 Worker 循环会把尚未规划的 InboxItem 转换成每设备唯一的持久 Delivery。系统通知总开关默认关闭，安静时段默认是北京时间 22:00–08:00；规划和发送前都会检查静默边界。408、429、5xx 和网络错误指数退避，最多尝试 5 次；404/410 将设备标为失效。

浏览器权限必须由用户在 `/notifications` 明确点击后授予。iOS/iPadOS 16.4+ 还需要先把网站添加到主屏幕，再从主屏幕应用内启用。详细启用、数据流、安全与排障见 `WEB_PUSH.md`。

## 8. Agent Prompt 当前边界

当前 AI 定时任务是独立上下文，不自动读取聊天、长期记忆、搜索结果或插件。Phase 3 将增加专业回答策略、搜索与引用；通知层仍只消费 Inbox，不直接承担 AI 任务执行。详细决策见 `adr/ADR-035-AGENT-PROMPT-TASK-EXECUTION.md`。
