# GameSession 基础

状态：Phase 6.1 已完成

GameSession 是娱乐模式的独立事实源。它保存世界设定、内容边界与角色卡，但不保存普通聊天消息，也不会创建 MemoryCandidate 或正式 Memory。

## 1. 数据边界

```text
users
  └── game_sessions
        └── game_characters

users
  ├── conversations ── messages
  └── memory_items
```

`game_sessions` 与 `game_characters` 只通过本地用户和彼此关联，不含 Conversation、Message、MemoryCandidate 或 Memory 外键。删除游戏会话会级联删除其角色卡，不影响普通对话和长期记忆。

普通聊天仍可选择 `entertainment` 交互模式，但服务端 MemoryCandidate 流程会忽略该模式下的消息；即使文字看起来像“请记住”，也不会成为长期记忆候选。

GameSession 保存：

- 会话名称、玩法类型和准备/运行状态。
- 世界名称、前提、叙事语调与显式规则。
- 整个游戏会话的内容边界。
- 乐观锁版本与创建/更新时间。

角色卡保存名称、身份、控制者、简介、性格、目标和角色专属边界。控制者仅是未来叙事语义，不授予模型、插件或工具权限。

## 2. API

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` / `POST` | `/api/v1/game-sessions` | 列表或创建 GameSession，可同时建立首张角色卡 |
| `GET` / `PATCH` / `DELETE` | `/api/v1/game-sessions/:id` | 读取、更新或删除世界设定 |
| `POST` | `/api/v1/game-sessions/:id/characters` | 添加角色卡 |
| `PATCH` / `DELETE` | `/api/v1/game-sessions/:id/characters/:characterId` | 更新或删除角色卡 |

创建、更新和删除均使用严格 Schema。世界规则、内容边界、角色目标和角色边界会去重并限制数量。Session 和 Character 分别使用版本锁；角色变更也推进 Session 版本，使多个设备不会静默覆盖彼此的角色列表。

## 3. 客户端

Web 和 Capacitor APK 共用 `/entertainment` React 页面与 API Client。当前页面支持：

- 创建角色扮演、AI 跑团或互动故事设定。
- 编辑世界前提、语调、规则和内容边界。
- 添加、编辑和删除用户、AI 或共同控制的角色卡。
- 清楚显示这些数据属于独立存储，尚未开始正式游玩。

## 4. 当前不包含

Phase 6.1 不调用模型，不产生剧情回合，不掷骰，也不提供暂停、继续、分支、检查点或导出。后续顺序为：

1. Phase 6.2：角色扮演回合、暂停/继续、分支与导出。
2. Phase 6.3：可复现 Dice Tool 与受 Schema 校验的状态补丁。
3. Phase 6.4：角色、场景、物品、检定与检查点闭环。
4. Phase 6.5：用 Plugin API v1 接入新的娱乐规则包。
