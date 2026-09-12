# ADR-035：Agent Prompt Task 服务端执行

- 状态：Accepted
- 日期：2026-09-13

## 背景

普通提醒只需在到期时保存用户预先填写的正文。Agent Prompt Task 则需要在网页关闭后调用模型、维持长耗时 Run 的所有权，并把生成内容可靠保存为历史结果。模型请求是外部副作用，不能由浏览器计时器承担，也不能因为 Push 失败而丢失结果。

## 决策

1. `scheduled_tasks.kind` 支持 `reminder` 与 `agent_prompt`；AI 任务必须具有非空 prompt，API 与 PostgreSQL 双层校验。
2. Worker 直接复用服务端 Credential Vault 和 OpenAI-compatible Provider，不经浏览器或内部 HTTP 回环，API Key 不进入任务、Inbox 或日志。
3. 固定执行说明作为 `system` 消息，用户保存的任务要求始终作为 `user` 消息，避免把普通输入提升为系统权限。
4. 模型生成期间每隔租约时长约三分之一续租，生成完成后在写结果前再续租一次；续租失败会中止上游请求，旧 Worker 不能落库。
5. 同批 Run 并发进入执行，避免一个长 AI 调用令其余已认领 Run 在队列中耗尽租约。
6. 限流、上游暂时不可用等可重试错误保留非终态，租约到期后由 Scheduler 重新认领；配置缺失、无输出、响应过大等永久错误写入失败 Run。
7. 单次输出上限为 100,000 字符。成功结果与 Run `succeeded` 终态在同一事务写入 Durable Inbox，`result_summary` 记录所用模型但不复制正文。
8. Inbox 继续作为事实来源；现有 Push Provider 只消费 Inbox，不直接调用模型，也不在锁屏显示生成正文。
9. Inbox 使用现有安全 Markdown/KaTeX 渲染，不启用原始 HTML。

## 取舍

- 当前 Agent Prompt 是独立上下文，只包含固定执行说明与任务 prompt；不会自动读取聊天、记忆、网页或插件。专业回答、搜索与引用属于 Phase 3。
- 模型调用是 at-least-once 外部副作用：Worker 在响应保存前崩溃时，重试可能再次消耗模型额度，但数据库 fencing 保证只有当前租约持有者能保存结果。
- 当前不引入额外队列或工作流引擎。PostgreSQL Claim、Lease、TaskRun 和 Inbox 已足以支撑个人使用规模。

## 结果

用户可以创建单次、每日或每周 AI 定时任务。到期后独立 Worker 使用服务端模型配置生成内容，持久保存执行状态和 Inbox 历史；网页关闭不影响执行，Push 仍作为可失败的附加通知。
