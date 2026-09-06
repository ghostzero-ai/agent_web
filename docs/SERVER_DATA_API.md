# Conversation/Message 服务端 API

Sprint 1.2 提供单用户 Conversation/Message Repository 和 `/api/v1` HTTP 接口。它是 Chat UI 迁移到服务端的基础，不包含模型调用、Streaming 或旧 localStorage 导入。

模型状态与 Streaming 端点已在 Sprint 1.3 加入，详见 `docs/SERVER_MODEL_PROVIDER.md`。

## 1. 使用前提与安全边界

1. 配置 `web/.env.local` 中的 `DATABASE_URL`。
2. 在 `web/` 执行 `npm run db:migrate`。
3. 启动 `npm run dev`。

当前版本没有登录系统，所有请求都映射到固定的本地用户 `00000000-0000-4000-8000-000000000001`。只允许在本机、可信局域网或经过访问控制的私有网络使用，不得直接暴露到公网。身份认证和多用户隔离不是本 Sprint 范围。

所有响应包含：

```text
Cache-Control: no-store
X-Request-Id: <uuid>
```

数据库中的 `timestamptz` 经 JSON 响应序列化为 UTC ISO 8601 字符串。

## 2. 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/health` | 检查数据库 readiness 与脱敏模型配置状态 |
| `GET` | `/api/v1/conversations` | 按更新时间倒序列出会话，不携带消息 |
| `POST` | `/api/v1/conversations` | 创建会话 |
| `GET` | `/api/v1/conversations/:id` | 获取会话及完整消息树 |
| `DELETE` | `/api/v1/conversations/:id` | 删除会话并级联删除消息 |
| `PATCH` | `/api/v1/conversations/:id` | 用乐观版本锁更新标题 |
| `POST` | `/api/v1/conversations/:id/messages` | 追加一个消息节点并将其设为活动叶节点 |
| `PATCH` | `/api/v1/conversations/:id/active-leaf` | 切换当前活动分支 |
| `POST` | `/api/v1/imports/local-storage` | 预检或确认导入浏览器旧会话 |

### 创建会话

```json
{
  "title": "事务学习",
  "mode": "professional"
}
```

`title` 可省略，默认“新对话”；`mode` 可选 `auto`、`professional`、`companion`、`reflection`，默认 `auto`。成功返回 `201` 和 `Location`。

### 追加消息

```json
{
  "parentMessageId": "父消息 UUID，首条消息可为 null",
  "role": "user",
  "content": "什么是数据库事务？",
  "status": "complete",
  "model": null,
  "citations": []
}
```

`role` 支持 `system`、`developer`、`user`、`assistant`、`tool`；`status` 支持 `pending`、`streaming`、`complete`、`failed`。省略字段使用 `parentMessageId=null`、`status=complete`、`model=null`、`citations=[]`。

Repository 会锁定目标会话，确认父消息存在且属于同一会话，然后在同一事务中写入 Message、推进 `activeLeafMessageId`、更新时间并递增版本。任何一步失败都不会留下半条消息。

### 更新标题

```json
{
  "title": "新的会话标题",
  "expectedVersion": 3
}
```

标题更新与活动分支切换使用相同的乐观版本规则。Chat 在首条用户消息持久化后更新自动标题，因此刷新页面或更换设备后标题仍一致。

### 切换活动分支

```json
{
  "messageId": "目标叶消息 UUID",
  "expectedVersion": 4
}
```

目标消息必须属于该会话且没有子节点。`expectedVersion` 必须等于客户端最近读取到的 Conversation `version`；不一致返回 `409 VERSION_CONFLICT`，客户端应重新读取会话后再决定是否重试。只有尚无消息的空会话可以使用 `messageId=null`；非空会话必须指向真实叶节点。

## 3. 响应格式

成功响应使用：

```json
{
  "data": {}
}
```

删除成功返回 `204`，没有响应正文。

失败响应使用稳定结构：

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Conversation version does not match.",
    "retryable": false,
    "requestId": "request uuid",
    "details": []
  }
}
```

客户端只能根据 `code` 分支，不应解析 `message`。当前错误码：

| HTTP | Code | 说明 |
|---|---|---|
| 400 | `INVALID_JSON` | 请求正文不是合法 JSON |
| 400 | `INVALID_REQUEST` | UUID、字段、枚举或长度校验失败 |
| 404 | `CONVERSATION_NOT_FOUND` | 会话不存在 |
| 404 | `MESSAGE_NOT_FOUND` | 父消息或目标叶节点不存在 |
| 409 | `INVALID_MESSAGE_PARENT` | 消息节点属于另一会话 |
| 409 | `INVALID_ACTIVE_LEAF` | 目标节点有子节点，不是真正叶节点 |
| 409 | `VERSION_CONFLICT` | 客户端 Conversation 版本已过期 |
| 500 | `INTERNAL_ERROR` | 未预期的服务端或数据库错误；内部细节不会返回客户端 |

## 4. 当前边界

- API 返回整棵消息树，由客户端根据 `activeLeafMessageId` 计算活动路径。
- 单用户阶段暂不分页；数据量增长前必须给会话列表和消息树增加游标策略。
- API 不接受客户端指定 User ID，避免伪造其他身份。
- Chat 页面已经通过这些端点创建、读取、删除、重命名会话，追加消息和切换树分支。
- `agent_chat_sessions` 不再是运行时事实源，只用于 Sprint 1.4 的显式一次性导入；详细契约见 `docs/LEGACY_DATA_IMPORT.md`。
