# ADR-041：会话模式持久化与安全切换

- 状态：Accepted
- 日期：2026-09-26

## 背景

Core 3.1.1 已定义五种模式并让持久化的 `mode` 进入模型 Prompt，但数据库枚举尚不支持 `entertainment`，Chat 也没有选择入口。模式如果只保存在浏览器，会在刷新或跨设备时丢失；若用不带版本条件的更新，又可能覆盖同一会话刚发生的消息追加或分支切换。

## 决策

1. 模式属于 Conversation 元数据，存入 PostgreSQL；浏览器状态只是服务端记录的投影。
2. `PATCH /api/v1/conversations/:id` 接受可选的 `title`、`mode` 和必需的 `expectedVersion`。标题与模式至少提供一个；更新成功后版本递增。
3. Repository 在事务中锁定会话并执行乐观版本检查。模式更新不修改 Message、消息父子关系或 `activeLeafMessageId`。
4. Chat 的模式选择器直接读取 Mode Registry；请求进行中或已有模式更新在途时禁用。冲突或失败后重新读取服务端会话，避免界面保留虚假的本地选择。
5. 模式变更只作用于之后构造的 Prompt，不追溯修改历史消息、已生成回答或当前保存的 Prompt 快照。
6. PostgreSQL `conversation_mode` 增加 `entertainment`，迁移和回滚都通过重建枚举实现。回滚时无法由旧 Schema 表达的 `entertainment` 明确降级为 `auto`。

## 后果

- 模式选择可跨刷新和设备恢复，并与标题、消息追加、分支切换共享同一版本序列。
- Prompt 导出会反映发出该请求时实际生效的模式，而不是导出时界面上的最新选择。
- 回滚会有意丢失娱乐模式标记，但保留会话与整棵消息树。
- 当前“娱乐”只改变交互协议，不代表 GameSession、骰子、人物卡或场景状态已经实现；这些能力继续留在 6.x。
