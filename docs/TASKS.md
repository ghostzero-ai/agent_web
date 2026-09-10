# Task/TaskRun 任务系统

Sprint 2.1 建立任务数据模型、HTTP API 和管理页面；Sprint 2.2 增加数据库驱动的到期认领、唯一 Run、租约恢复与 Worker fencing；Sprint 2.3 已完成独立 Reminder Worker 与 Durable Inbox。当前版本在网页关闭后仍能执行普通提醒并保存到应用内收件箱，但**尚无手机系统级 Push 通知**。

## 1. 使用方式

1. 执行数据库迁移：在 `web/` 运行 `npm run db:migrate`。
2. 推荐用仓库根目录的 Docker Compose 同时启动 Web、Worker 和 PostgreSQL；本机开发也可分别启动 Web 与 `npm run worker:reminders`。
3. 访问 `/tasks` 创建、编辑、暂停、恢复或删除提醒，访问 `/inbox` 查看执行结果。

当前仅支持固定单用户和 `reminder` 类型。可选时间规则：

| 类型 | 输入 | 含义 |
|---|---|---|
| `once` | 带时区的 ISO 8601 `runAt` | 在未来某个时刻执行一次 |
| `daily` | `HH:mm` | 每天在北京时间执行 |
| `weekly` | `weekday` 1–7 + `HH:mm` | 每周一至周日的北京时间执行 |

第一版固定使用 `Asia/Shanghai`。浏览器的 `datetime-local` 值会显式按 UTC+8 转成 ISO 字符串，因此手机和电脑处于不同时区时不会依赖设备默认时区。

## 2. 数据模型

### `scheduled_tasks`

保存用户意图和下一次计划时间：标题、可选提醒内容、结构化时间规则、时区、`next_run_at`、状态与乐观锁版本。`active` 任务必须具有 `next_run_at`；暂停任务会清空它。

### `task_runs`

保存每次计划执行的独立事实：计划时间、认领者、租约、尝试次数、执行状态、结果、错误和通知时间。`(task_id, scheduled_for)` 唯一约束是防止同一次计划被重复创建的最后一道数据库防线。

删除任务会级联删除其 Run。编辑或暂停任务会把尚未完成的旧 Run 标为 `cancelled`，防止 Worker 执行过期内容。

### `inbox_items`

保存已发生提醒的标题、正文快照、计划发生时间和已读状态。每个 TaskRun 最多生成一条 InboxItem。删除源 Task/TaskRun 后外键设为 null，但快照继续保留，避免历史提醒随任务清理而消失。

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

创建每日提醒示例：

```json
{
  "title": "复习英语",
  "prompt": "背诵今天的 20 个单词",
  "schedule": { "type": "daily", "time": "20:00" }
}
```

更新请求必须带客户端最后读取到的版本：

```json
{
  "title": "复习英语",
  "prompt": "背诵今天的 20 个单词",
  "schedule": { "type": "daily", "time": "21:00" },
  "status": "active",
  "expectedVersion": 2
}
```

版本过期返回 HTTP 409 `VERSION_CONFLICT`，页面会重新读取列表并要求用户再次确认操作。一次性时间必须在服务端当前时间之后。

## 4. 安全与当前边界

- API 不接受 `userId`、`kind`、`nextRunAt` 或任意任务状态；这些值由服务端计算或限制。
- Zod 使用严格对象校验，拒绝未知字段、非法 UUID、错误日期、越界星期和非法时间。
- 数据库错误不会返回连接信息或内部异常；公开错误仅暴露稳定错误码。
- 当前没有应用登录鉴权，只能通过 localhost 或 Tailscale 可信私网访问，禁止使用 Funnel 公开暴露。
- Worker 日志不输出任务标题、正文、数据库连接串或 API Key；收件箱正文由 React 作为纯文本渲染，不执行 HTML。
- 页面关闭不影响 Worker；但笔记本关机或休眠时无法执行。恢复后重复任务只补偿一次，避免提醒风暴。
- 应用内收件箱不是系统通知；需要主动打开 `/inbox`，页面打开时每 15 秒自动刷新。系统级 Push 属于 Sprint 2.4。

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

Docker Compose 的 `worker` 服务默认每 5 秒扫描一次，使用 Scheduler Claim 领取最多 20 个 Run。普通提醒无需调用模型：Worker 将 Run 切换到 `running`，随后在一个数据库事务中创建 InboxItem 并把 Run 标为 `succeeded`。只有当前 `workerId + attempt + 未过期 lease` 可以完成事务。

如果某项暂时失败，其余同批 Run 继续执行；失败项保留为非终态，租约到期后由当前或其他 Worker 接管。同一 TaskRun 的唯一约束保证重试不会产生重复 InboxItem。普通提醒执行很短，因此当前不需要周期续租；Sprint 2.5 的长耗时 AI 任务必须在执行期间续租。

可选环境变量：

| 变量 | 默认值 | 限制 |
|---|---:|---|
| `REMINDER_WORKER_ID` | 主机名 + PID | 可留空自动生成 |
| `REMINDER_POLL_INTERVAL_MS` | `5000` | 1000–300000 毫秒 |
| `SCHEDULER_BATCH_SIZE` | `20` | 1–100 |
| `SCHEDULER_LEASE_MS` | `60000` | 5000–900000 毫秒 |

`docker compose --env-file .env.selfhost ps` 应同时显示 `postgres`、`web` 与 `worker`。数据库还原脚本会同时停止 Web 和 Worker，避免还原期间继续写入。

## 7. 下一阶段接口边界

Sprint 2.4 将在 Durable Inbox 之上增加 Web Push、订阅管理、安静时段和投递状态。Inbox 始终是提醒事实来源；Push 只是可失败、可重试的通知渠道，不能取代 Inbox。
