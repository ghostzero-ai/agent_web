# ADR-059：GameSession 与普通对话、长期记忆隔离

- 状态：Accepted
- 日期：2026-09-30
- 阶段：Phase 6.1

## 背景

娱乐模式已经存在于 Mode Registry，但普通 Conversation 只能保存消息树，Memory 系统则用于用户确认的现实偏好、目标、资料与事实。若把虚构人物、世界规则或剧情事件写进这两套数据，会让专业回答错误地引用虚构状态，也无法在后续为角色、骰子和检查点建立明确事务边界。

## 决策

1. 新增独立 `game_sessions` 和 `game_characters`；它们不引用 Conversation、Message、MemoryCandidate 或 Memory。
2. 世界名称、前提、语调、规则和内容边界属于 GameSession；角色卡具有独立 ID、控制者、描述、性格、目标、边界和版本。
3. Session 与 Character 都使用乐观版本控制。角色增删改会同步推进 Session 版本，保证角色列表级别的并发一致性。
4. 所有写入使用严格请求 Schema 和数据库约束。控制者字段只表达叙事归属，不是权限模型。
5. Web 与 Capacitor 复用 `/entertainment` 页面和 `/api/v1/game-sessions` API，不建立移动端业务副本。
6. Phase 6.1 不把普通娱乐模式 Conversation 自动迁移成 GameSession，也不调用模型。用户必须显式创建独立游戏会话。
7. 普通 Conversation 仍可使用 `entertainment` 交互协议，但 MemoryCandidate 提取对该模式固定返回空结果，虚构陈述不能进入长期记忆确认链路。

## 后果

- 虚构设定不会参与普通记忆检索、Persona、主动问候或专业回答 Prompt。
- 删除 GameSession 只级联删除角色卡，不影响 Chat、Task、Inbox 和 Memory。
- Phase 6.2 可以新增 `game_turns` 与分支，不必改变现有 Message 树。
- Phase 6.3–6.4 可在同一事务边界加入事件、状态补丁和检查点。
- 代价是娱乐模式与普通聊天不能自动共享历史；未来若需要导入现实资料，必须设计显式、可确认的桥接流程。
