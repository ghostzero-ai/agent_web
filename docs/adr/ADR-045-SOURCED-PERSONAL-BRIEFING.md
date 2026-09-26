# ADR-045：有来源的个人简报垂直切片

- 状态：Accepted
- 日期：2026-09-27
- 对应阶段：Phase 4.1

## 背景

项目已经具备可靠 Task/TaskRun、独立 Worker、服务端模型配置、SearXNG 搜索、Durable Inbox 和 Push，但这些能力尚未形成用户每天可感知的主动内容体验。Phase 4.1 需要完成最小闭环，同时避免提前建设新闻聚类、兴趣画像或通用内容平台。

## 决策

新增 `personal_briefing` Task Kind，复用 `scheduled_tasks.prompt` 保存用户填写的关注主题或简报要求，不新增内容表或配置 JSON。到期执行流程为：

```text
personal_briefing Task
  → Scheduler claim + lease
  → SearXNG 搜索主题与当天进展
  → 证据作为不可信数据进入 Agent Prompt
  → 模型输出“今日重点 / 为什么值得关注 / 一个思考问题”
  → 代码校验章节、引用编号和单一问题
  → 代码附加真实来源、日期与订阅理由
  → Inbox 与 Run 成功状态原子提交
  → 现有 Push Delivery
```

来源清单由代码根据检索结果生成，而不是让模型生成链接。模型必须至少使用一个已知 `[Sx]` 编号，未知编号、缺少固定章节、私自输出来源章节或思考区不含且只含一个问号都会使本次 Run 失败。这样可以保证最终 Inbox 内容始终包含可点击的实际检索来源，但不声称搜索摘要足以证明全文事实。

Worker 在搜索与模型调用的整个周期继续续租。搜索暂时不可用属于可重试失败；无可用来源、缺少主题和结构不合格属于本次 Run 的稳定失败。重复任务在下一计划周期仍可继续运行。

## 平台边界

- Inbox 是简报事实来源，Push 只是可失败 Delivery。
- APK Local Notification 只同步普通 `reminder`，不能在服务端内容生成前伪装简报结果。
- Web 与 Worker 共享内部 `WEB_SEARCH_BASE_URL`，SearXNG 不向宿主机公开端口。
- API Key 继续只由服务端 Credential Vault 读取，搜索证据、Inbox 和日志均不包含密钥。
- Phase 4.1 不抓取网页全文、不做跨期聚类、不记录兴趣反馈，也不建立 ContentItem 表；这些属于 Phase 4.2–4.4。

## 回滚

迁移 `0012_good_mantis` 只扩展现有 Task/Inbox Check Constraint。回滚时把已有 `personal_briefing` Task 与 Inbox 来源降级为 `agent_prompt`，保留标题、主题和正文，再恢复旧约束，避免因新类型数据导致回滚失败或丢失内容。

## 后果

用户现在可以在任务页创建一次、每天或每周的个人简报，并在网页关闭后收到有日期、来源、关注理由和一个思考问题的 Inbox 内容。该垂直切片验证现有基础设施能产生实际产品价值；下一阶段应优先处理跨期聚类、去重和反馈，而不是继续扩张生成框架。
