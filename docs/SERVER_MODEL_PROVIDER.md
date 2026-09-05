# 服务端 Model Provider 与 SSE

Sprint 1.3 把 OpenAI-compatible 模型请求从浏览器迁入 Next.js Node.js Runtime。浏览器只访问本站 API，真实 API Key 不再出现在客户端代码、HTML、React 状态或 localStorage。

## 1. 配置

复制 `web/.env.example` 为 `web/.env.local`，设置：

```dotenv
AI_API_KEY=<真实 Key>
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_ALLOW_INSECURE_HTTP=false
```

- 变量名不能添加 `NEXT_PUBLIC_` 前缀。
- `AI_BASE_URL` 默认只接受 HTTPS。
- 自托管管理员确实需要连接可信 HTTP 模型服务时，才可设置 `AI_ALLOW_INSECURE_HTTP=true`。
- 修改环境变量后必须重启 Next.js 服务。
- `/api-key` 只显示是否配置、Provider Origin 和模型名，永不返回 Key 或 URL 凭据。

## 2. 端点

### `GET /api/v1/model/config`

返回非敏感状态：

```json
{
  "data": {
    "configured": true,
    "baseUrl": "https://api.openai.com",
    "model": "gpt-4o-mini",
    "missing": []
  }
}
```

### `POST /api/v1/model/stream`

请求只接受 Provider 标准消息：

```json
{
  "messages": [
    { "role": "system", "content": "保持专业" },
    { "role": "user", "content": "解释数据库事务" }
  ]
}
```

限制：1–500 条消息、单条最多 1,000,000 字符、总内容最多 2,000,000 字符；未知字段被拒绝。服务端补充 Model、Authorization 和 `stream=true` 后请求上游 `/chat/completions`。

成功响应为 `text/event-stream`：

```text
event: meta
data: {"requestId":"...","model":"gpt-4o-mini"}

event: delta
data: {"text":"增量文字"}

event: done
data: {}
```

建立 SSE 前的配置/校验错误使用普通 JSON 和 400/503。建立 SSE 后的 Provider 错误使用 `event: error`，包含稳定 `code`、安全文案、`retryable` 和 `requestId`。

## 3. 取消传播

Chat 的“停止生成”会中止浏览器 fetch；Route Handler 监听请求 AbortSignal，并中止上游 Provider fetch。响应流被客户端取消时也会触发同一个上游 AbortController。取消不是重试，不会继续在服务器后台消耗模型输出。

## 4. Provider 错误映射

| 上游情况 | Code | Retryable |
|---|---|---|
| 401/403 | `PROVIDER_AUTHENTICATION_FAILED` | false |
| 429 | `PROVIDER_RATE_LIMITED` | true |
| 404 | `PROVIDER_MODEL_NOT_FOUND` | false |
| 其他 4xx | `PROVIDER_REQUEST_REJECTED` | false |
| 5xx/网络失败 | `PROVIDER_UNAVAILABLE` | true |
| 缺失正文/错误 SSE | `PROVIDER_INVALID_RESPONSE` | false |

上游响应正文不会直接返回浏览器，避免泄露 Provider 内部细节。

## 5. 浏览器迁移行为

- `agent_api_key`、`agent_api_base_url`、`agent_api_model` 不再被读取。
- 打开 Chat 或模型配置页时会删除这三个旧 localStorage 项。
- 会话键 `agent_chat_sessions` 暂时保留到 Sprint 1.4 导入完成。
- Chat 在每个 `delta` 更新同一个 Assistant 消息 ID，Retry 仍建立兄弟分支，不会为每个 Token 创建消息节点。

## 6. 当前边界

- 当前 Streaming 是无状态模型代理；会话仍在浏览器。Sprint 1.4 完成导入与服务端切换后，服务端 Conversation/Message 才成为 UI 事实来源。
- 当前没有工具调用、Token 计量、Run 表或断线恢复；这些属于后续 Agent Runtime 和 Task 阶段。
- 自定义 Base URL 来自服务器管理员环境变量，不接受浏览器传入。公网多用户版本仍需 Provider 白名单与更强的网络出口策略。
