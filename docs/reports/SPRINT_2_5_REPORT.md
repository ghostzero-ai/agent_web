# Sprint 2.5 总结报告：Agent Prompt Task

- 完成日期：2026-09-13
- 状态：工程实现完成
- 下一 Sprint：3.1 Answer Policy and Citation Contract

## 1. 交付结果

Sprint 2.5 完成了第一条可在网页关闭后调用模型的任务链路：

```text
用户创建 agent_prompt Task
  → Scheduler 创建唯一 TaskRun 并授予租约
  → Worker 读取服务端 Credential Vault
  → OpenAI-compatible Provider 流式生成并周期续租
  → 结果与 succeeded Run 原子写入 Durable Inbox
  → 现有 Push Provider 发送通用系统通知
```

任务页面现在可以选择“普通提醒”或“AI 定时任务”。AI 任务要求必填，支持单次、每日和每周计划；结果进入 Inbox 历史并以安全 Markdown、表格和数学公式显示。

## 2. 可靠性与失败语义

- API 与数据库共同保证 `agent_prompt` 具有非空 prompt。
- 长模型调用周期续租，并在持久化前再次验证租约。
- 同批 Run 并发启动，避免等待中的 Run 被长任务耗尽租约。
- 可重试 Provider 错误等待租约恢复；永久错误写入 TaskRun 的稳定错误码。
- 输出超过 100,000 字符会中止并记录失败。
- Inbox 写入与 Run 成功状态处于同一事务；Push 失败不回滚结果。

## 3. 安全边界

- API Key 只由服务端 Credential Vault 解密，任务、Inbox、响应和 Worker 日志均不包含 Key。
- 用户 prompt 以模型 `user` 角色发送，不提升为 `system` 指令。
- 锁屏通知继续使用通用文案，不暴露 AI 生成正文。
- Markdown 不执行原始 HTML；链接在新页面打开并使用安全 rel 属性。

## 4. 当前边界

Agent Prompt Task 目前是独立上下文，不会自动读取会话、长期记忆、搜索结果或插件。Phase 3 将增加回答模式、搜索、引用契约和质量验证。

## 5. 验证

- Vitest 全量验证：44 个测试文件、170 项测试全部通过。
- TypeScript、ESLint、Drizzle schema check、生产构建全部通过。
- Playwright 移动端关键路径：Task 与 Inbox 共 2 项通过。
- Docker Compose 实机验证：PostgreSQL healthy、Web healthy、Worker running，健康 API 返回 200。
- 数据库迁移记录确认最新版本为 `0008_oval_kang.sql`；Web 与 Worker 重启后均报告数据库已是最新状态。

未自动调用真实付费模型：测试使用受控 Provider 流验证生成、流式聚合、续租、重试和持久化，不消耗用户 API 配额，也不向个人数据库写入伪造任务。真实 Provider 可通过任务页面创建一条短期 AI 定时任务完成手工验收。
