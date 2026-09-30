# GameSession 与角色扮演回合

状态：Phase 6.3 已完成

GameSession 是娱乐模式的独立事实源。它保存世界设定、内容边界、角色卡和剧情回合树，但不保存普通聊天消息，也不会创建 MemoryCandidate 或正式 Memory。

## 1. 数据边界

```text
users
  └── game_sessions
        ├── game_characters
        └── game_turns ── parent_turn_id → game_turns.id
              └── game_events（当前为不可变 dice_roll）

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

一个 `game_turn` 原子保存一次玩家输入和对应的 AI 叙事、模型名称、父回合、受校验状态补丁、应用后状态快照与创建时间。父指针构成树；从历史回合继续时创建新子节点，不改写既有后续内容。新分支以父节点状态快照为基线，不能继承其他分支的状态。模型 Prompt 只包含所选父回合的祖先路径，并用字符预算优先保留最近剧情，不能读取同级或其他分支剧情。

`game_events` 当前保存不可变骰子事件。事件记录用途、骰子表达式、seed、算法版本、逐骰点数与总和；同一算法、seed 和参数能得到相同结果。模型只能引用服务端 Dice Tool 的结果，没有可信事件时不得自行声称掷骰。

状态由 `scene`、`objectives`、`flags`、`resources` 与 `inventory` 组成。模型每回合严格返回 `narrative + statePatch`，服务端拒绝未知字段、非法状态键、越界数值、负资源/物品结果和伪造工具调用。补丁验证与应用发生在持久化前；回合、快照、骰子事件和活动叶子随后在单个数据库事务中写入。

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
- 可选 2/4/6/8/10/12/20/100 面服务端可信骰子，并查看 seed 与算法版本。
- 查看所选分支的场景、目标、标记、资源和物品状态；分支切换时状态随节点切换。

## 4. 当前不包含

Phase 6.3 已形成可信骰子和通用状态基础，但还没有完整人物属性、规则驱动检定、结构化场景/道具定义或检查点恢复。当前模型响应在服务端完成并通过严格 JSON 校验后原子写入，不提供逐 Token 的中间显示。后续顺序为：

1. Phase 6.4：角色、场景、物品、检定与检查点闭环。
2. Phase 6.5：用 Plugin API v1 接入新的娱乐规则包。
