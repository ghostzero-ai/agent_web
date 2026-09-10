# Task/TaskRun 任务系统

Sprint 2.1 建立任务数据模型、HTTP API 和管理页面；Sprint 2.2 增加数据库驱动的到期认领、唯一 Run、租约恢复与 Worker fencing。当前版本可以可靠地产生执行记录，但**尚无常驻 Worker，也不会发送提醒或通知**。自动轮询、普通提醒执行和 Durable Inbox 属于 Sprint 2.3。

## 1. 使用方式

1. 执行数据库迁移：在 `web/` 运行 `npm run db:migrate`。
2. 启动 Web 服务。
3. 访问 `/tasks` 创建、编辑、暂停、恢复或删除提醒。

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

## 3. HTTP API

所有成功响应使用 `{ "data": ... }`，错误使用稳定的 `{ "error": { code, message, retryable, requestId } }`。响应设置 `Cache-Control: no-store` 和 `X-Request-Id`。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/tasks` | 列出任务 |
| `POST` | `/api/v1/tasks` | 创建任务 |
| `GET` | `/api/v1/tasks/:id` | 读取任务 |
| `PATCH` | `/api/v1/tasks/:id` | 完整更新、暂停或恢复任务 |
| `DELETE` | `/api/v1/tasks/:id` | 删除任务 |

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
- 页面关闭后数据不会丢失，但当前没有常驻 Worker，提醒还不会自行触发。不要使用浏览器 `setTimeout` 代替下一阶段的服务端 Worker。

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

## 6. 下一阶段接口边界

Sprint 2.3 将增加常驻 Reminder Worker：周期性调用现有 claim，执行普通提醒，使用租约续期，并把结果写入 Durable Inbox。Worker 不能把页面是否打开作为运行条件；通知投递仍留给 Sprint 2.4。
