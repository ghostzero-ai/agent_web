# Task/TaskRun 任务系统

Sprint 2.1 建立任务数据模型、HTTP API 和管理页面。当前版本负责可靠地保存和管理提醒；它**不会自动执行任务或发送通知**。后台认领、执行幂等和错过任务补偿属于 Sprint 2.2。

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

为下一阶段保存每次计划执行的独立事实：计划时间、认领者、租约、尝试次数、执行状态、结果、错误和通知时间。`(task_id, scheduled_for)` 唯一约束是防止同一次计划被重复创建的最后一道数据库防线。

删除任务会级联删除其 Run。当前 Sprint 不创建 Run。

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
- 页面关闭后数据不会丢失，但提醒还不会自行触发。不要使用浏览器 `setTimeout` 代替下一阶段的服务端 Scheduler。

## 5. 下一阶段接口边界

Sprint 2.2 只通过数据库认领到期的 `active` 任务，在事务内创建唯一 TaskRun 并推进重复任务的 `nextRunAt`。Worker 必须依赖租约和唯一约束实现至少一次扫描、单次有效执行；不能把页面是否打开作为运行条件。
