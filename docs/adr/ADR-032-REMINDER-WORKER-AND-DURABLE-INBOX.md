# ADR-032：Reminder Worker 与 Durable Inbox

- 状态：Accepted
- 日期：2026-09-11

## 背景

Sprint 2.2 已能安全认领到期任务，但单次扫描命令不会自行持续运行。浏览器计时器依赖页面生命周期，无法承担“关闭网页后仍提醒”的需求。系统通知也可能因权限、网络或设备策略失败，因此不能成为唯一的提醒事实来源。

## 决策

1. 在 Docker Compose 中运行独立于 Next.js Web 的常驻 Node Worker，共享 PostgreSQL 与领域仓储。
2. Worker 默认每 5 秒批量 Claim 到期或租约过期的 Run，并将其切换为 `running`。
3. 普通 reminder 不调用模型；在同一数据库事务内创建 InboxItem 并将 TaskRun 标记为 `succeeded`。
4. 完成事务必须匹配 `workerId + attempt + 未过期 lease`，失去所有权的 Worker 不得写入结果。
5. `inbox_items.task_run_id` 唯一，保证一个 Run 最多产生一条提醒。
6. InboxItem 保存标题与正文快照；源 Task/TaskRun 删除时外键设为 null，历史提醒继续保留。
7. 单个 Run 失败不阻断批次；它保留非终态并在租约过期后重新认领。
8. Inbox 是持久事实源，未来 Web Push 只是通知投递渠道。
9. 数据库还原必须同时暂停 Web 与 Worker，避免导入期间后台写入。

## 安全与可观察性

- Worker 不接收浏览器提供的用户 ID，当前固定单用户边界由服务端仓储控制。
- API 严格校验 UUID、筛选和状态；错误响应不包含数据库内部信息。
- 提醒正文以纯文本渲染，不执行用户提供的 HTML。
- Worker 日志只记录事件、计数、Run ID 与错误类型，不记录正文、连接串或凭据。
- 当前无应用登录鉴权，Web/API 仍只允许 localhost 或可信 Tailscale 网络访问；Worker 和数据库不映射公网端口。

## 取舍

- 当前提醒只进入应用内 Inbox，不等同于 Android/iOS 系统通知；Push、订阅失效和安静时段属于 Sprint 2.4。
- 笔记本关机或休眠时 Worker 不运行；恢复后重复任务采用 Sprint 2.2 的合并补偿策略。
- 普通提醒的执行事务很短，不做周期续租。未来长耗时 AI Run 必须续租、记录阶段并采用更明确的失败策略。
- 当前按批次顺序完成提醒，适合单用户规模；只有观察到积压后才引入受控并发。

## 结果

任务创建、计划推进、后台执行与提醒读取已经形成不依赖页面生命周期的最小闭环。真实 Docker 验证中，一次性 Task 被独立 Worker 自动置为 completed，并产生唯一 unread InboxItem；移动端页面可筛选、标记和删除提醒。
