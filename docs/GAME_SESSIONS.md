# GameSession 与角色扮演回合

状态：Phase 6.2 已完成

GameSession 是娱乐模式的独立事实源。它保存世界设定、内容边界、角色卡和剧情回合树，但不保存普通聊天消息，也不会创建 MemoryCandidate 或正式 Memory。

## 1. 数据边界

```text
users
  └── game_sessions
        ├── game_characters
        └── game_turns ── parent_turn_id → game_turns.id

users
  ├── conversations ── messages
  └── memory_items
```

`game_sessions`、`game_characters` 与 `game_turns` 只通过本地用户和彼此关联，不含 Conversation、Message、MemoryCandidate 或 Memory 外键。删除游戏会话会级联删除角色卡和剧情回合，不影响普通对话和长期记忆。

普通聊天仍可选择 `entertainment` 交互模式，但服务端 MemoryCandidate 流程会忽略该模式下的消息；即使文字看起来像“请记住”，也不会成为长期记忆候选。

GameSession 保存：

- 会话名称、玩法类型和准备/运行状态。
- 世界名称、前提、叙事语调与显式规则。
- 整个游戏会话的内容边界。
- 乐观锁版本与创建/更新时间。
- 当前剧情叶子 `active_leaf_turn_id`。

角色卡保存名称、身份、控制者、简介、性格、目标和角色专属边界。控制者仅是未来叙事语义，不授予模型、插件或工具权限。

一个 `game_turn` 原子保存一次玩家输入和对应的 AI 叙事、模型名称、父回合与创建时间。父指针构成树；从历史回合继续时创建新子节点，不改写既有后续内容。模型 Prompt 只包含所选父回合的祖先路径，并用字符预算优先保留最近剧情，不能读取同级或其他分支剧情。

## 2. API

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` / `POST` | `/api/v1/game-sessions` | 列表或创建 GameSession，可同时建立首张角色卡 |
| `GET` / `PATCH` / `DELETE` | `/api/v1/game-sessions/:id` | 读取、更新或删除世界设定 |
| `POST` | `/api/v1/game-sessions/:id/characters` | 添加角色卡 |
| `PATCH` / `DELETE` | `/api/v1/game-sessions/:id/characters/:characterId` | 更新或删除角色卡 |
| `PATCH` | `/api/v1/game-sessions/:id/status` | 开始、暂停或继续游戏 |
| `POST` | `/api/v1/game-sessions/:id/turns` | 从指定父回合生成并保存下一回合 |
| `POST` | `/api/v1/game-sessions/:id/export` | 导出包含全部分支的 JSON 或 Markdown |

创建、更新和删除均使用严格 Schema。世界规则、内容边界、角色目标和角色边界会去重并限制数量。Session 和 Character 分别使用版本锁；状态、角色和回合变更都会推进 Session 版本，使多个设备不会静默覆盖当前剧情线。暂停状态拒绝新增回合；继续后才可生成。

## 3. 客户端

Web 和 Capacitor APK 共用 `/entertainment` React 页面与 API Client。当前页面支持：

- 创建角色扮演、AI 跑团或互动故事设定。
- 编辑世界前提、语调、规则和内容边界。
- 添加、编辑和删除用户、AI 或共同控制的角色卡。
- 开始、暂停和继续角色扮演。
- 以树形缩进展示全部剧情节点，标记当前剧情线和当前叶子。
- 从任意历史回合或故事开头创建新分支。
- 使用与 Chat 相同的安全 Markdown、代码和数学公式渲染。
- Web 下载、APK Filesystem + Share 导出完整 JSON/Markdown 记录。

## 4. 当前不包含

Phase 6.2 已形成角色扮演 MVP，但不掷骰、不应用结构化场景状态补丁，也没有物品栏、检定或检查点。当前模型响应在服务端完成后原子写入，不提供逐 Token 的中间显示。后续顺序为：

1. Phase 6.3：可复现 Dice Tool 与受 Schema 校验的状态补丁。
2. Phase 6.4：角色、场景、物品、检定与检查点闭环。
3. Phase 6.5：用 Plugin API v1 接入新的娱乐规则包。
