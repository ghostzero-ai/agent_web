# ADR-060：GameTurn 树与原子生成

状态：已接受（Phase 6.2）

## 背景

角色扮演需要从历史节点改选行动而不覆盖原剧情，同时必须继续与普通 Conversation、Message 和长期记忆隔离。模型请求还可能耗时或失败，不能预先写入一个看似完成的空回合。

## 决策

1. 一个 `game_turn` 保存玩家输入、AI 回复、模型、父回合与时间；`parent_turn_id` 构成独立树。
2. `game_sessions.active_leaf_turn_id` 记录当前剧情线叶子。Repository 校验叶子和父回合属于当前用户的 GameSession，避免数据库循环外键。
3. 从任意历史节点提交行动会新增子节点并切换活动叶子，不删除或改写其他分支。
4. 生成 Prompt 时只回溯所选父节点的祖先，最多携带最近 30 个回合且受 48,000 字符历史预算约束，预算不足时优先保留最近剧情；其他分支不会泄漏进当前剧情。
5. 世界规则、内容边界、角色卡和控制者语义进入固定服务端 System Prompt。虚构内容不会进入普通记忆链路。
6. 模型生成成功后，Repository 在事务中再次检查 Session 版本和 `active` 状态，再原子写入回合、切换叶子并推进版本。失败不产生半成品回合。
7. `setup → active`、`active → paused`、`paused → active` 是 Phase 6.2 允许的显式转换；暂停时拒绝生成。
8. JSON 与 Markdown 导出包含全部分支。Web 使用下载，APK 复用 Filesystem + Share Adapter。

## 结果

- 重新选择历史行动具有真正的树语义，旧剧情可追溯。
- 多设备并发由 Session 乐观锁显式报冲突，不静默覆盖当前剧情线。
- 模型失败不会留下“用户已发、AI 未回”的持久半回合；代价是 Phase 6.2 UI 暂不逐 Token 展示。
- Dice、结构化状态、检查点和流式持久化分别留给 Phase 6.3/6.4，不把 MVP 扩成完整跑团引擎。
