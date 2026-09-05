# ADR-026：服务端环境密钥与 OpenAI-compatible SSE

## 状态

Accepted

## 背景

原型把 API Key、Base URL 和 Model 放在 localStorage，并由浏览器直接请求 Provider。该方案受到 XSS、CORS 和单设备限制，也无法被未来 Scheduler/Worker 安全复用。Chat 同时只能等待完整 JSON，用户无法看到增量结果。

## 决策

### 1. 模型密钥只存在服务器环境

- 使用 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`。
- 禁止浏览器提交或读取 Key；配置状态只返回 Provider Origin 与 Model。
- 删除旧浏览器配置键，环境变量禁止 `NEXT_PUBLIC_` 前缀。
- Base URL 默认要求 HTTPS，可信自托管 HTTP 需要管理员显式开启。

### 2. 使用轻量 Provider 接口，不引入厂商 SDK

- `ModelProvider.stream()` 返回 `AsyncIterable<ModelStreamEvent>`。
- `OpenAICompatibleProvider` 调用 `/chat/completions`，兼容标准 SSE 与非流式 JSON fallback。
- Provider HTTP/网络/协议错误映射为稳定 code，上游正文不透传。

### 3. 浏览器通过本站 SSE 接收增量

- `/api/v1/model/stream` 只接收标准 role/content，不接收 URL、Model 或 Key。
- Route 先完成 Zod 校验和配置检查，再建立 SSE。
- `meta`、`delta`、`done`、`error` 使用命名事件和 JSON data。
- Chat 每次 delta 更新同一 Assistant 节点，完成时复用同一个消息 ID。

### 4. AbortSignal 贯通客户端与 Provider

浏览器停止 fetch、请求连接中断或主动取消 Response Stream，都会中止服务端上游 fetch。不会把已经取消的生成留在服务器继续运行。

### 5. 本 Sprint 保持会话 localStorage

先独立验证 Provider 安全边界和 Streaming，不同时承担旧数据迁移。Sprint 1.4 紧接着完成显式导入与服务端会话切换。

## 备选方案

1. 保留浏览器 BYOK：实现最少，但密钥暴露面、CORS 和后台任务问题无法解决。
2. 使用 OpenAI 官方 SDK：可减少部分协议代码，但会把统一 Provider 过早绑定到单一厂商；当前协议范围很小。
3. WebSocket：支持双向通信，但普通文本增量只需要单向流，SSE 更易调试和部署。
4. 等完整 JSON：实现简单，但无法展示首 Token，也无法自然取消正在读取的输出。
5. 同 Sprint 切换数据库会话：会把密钥、流、Repository、UI 和旧数据迁移混为一个不可控变更面。

## 后果

### 正面

- API Key 不进入浏览器，未来 Worker 可复用相同服务端 Provider。
- Chat 有真实增量反馈，停止生成能释放上游请求。
- Provider 错误、请求校验和 Request ID 形成稳定边界。
- 不增加厂商 SDK 依赖，仍兼容 DeepSeek 等 OpenAI-compatible 服务。

### 代价

- 单用户管理员必须通过环境文件配置并重启服务。
- 当前 Stream 不具备断线续传和持久 Run 历史。
- 手写 SSE 解析需要持续用分块、EOF、错误与取消测试保护。
