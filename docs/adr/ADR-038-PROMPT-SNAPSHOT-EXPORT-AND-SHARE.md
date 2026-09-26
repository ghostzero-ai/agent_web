# ADR-038：Prompt 请求快照、脱敏导出与平台分享

- 状态：Accepted
- 日期：2026-09-26

> Core 3.2 已由 ADR-042 将客户端请求快照升级为服务端 Prompt Envelope 与可审计导出；本 ADR 的脱敏规则和平台保存 Adapter 继续有效。

## 背景

用户需要把“真正给模型 API 的 Prompt”导出到本地，用于学习、复现和作品集展示。简单拼接聊天气泡会遗漏 Persona、记忆层和分支选择；直接导出完整请求又可能泄露个人记忆或凭据。Web 与 APK 的保存方式也不同，不能把浏览器下载逻辑散落进聊天业务。

## 决策

1. 在 `buildAgentPrompt` 完成后、请求发出前捕获不可变 `PromptRequestSnapshot`，因此快照与本次模型请求使用同一份 `PromptMessage[]`。
2. 模型 SSE `meta` 事件返回 request ID、Provider、Base URL 和 Model，并附加到对应快照。API Key、Authorization Header 和服务端错误栈永不进入该事件。
3. M1.2 导出当前应用运行期间、每个会话最近一次发送或重新生成的请求；刷新页面后不恢复快照。长期 Run 持久化留给 Core 3.2 Prompt Envelope。
4. JSON 是机器可读的完整结构，Markdown 是适合阅读与比较的层级视图；两者都包含 SHA-256 内容哈希。
5. 记忆层默认替换为明确的脱敏占位符。只有用户在导出窗口中显式勾选后，文件才包含本次请求的完整记忆上下文，并通过 `exactRequestContent` 标识是否为原始内容。
6. `FileExportAdapter` 隔离平台差异：Web 使用 Blob 下载；Capacitor 把 UTF-8 文件写入应用缓存后交给系统 Share Sheet。业务组件不得直接调用 Filesystem 或 Share 插件。
7. 导出文件始终排除模型 API Key、数据库凭据、Push Token 与内部错误栈；文件分享后的副本由用户和目标应用负责管理。

## 后果

- 用户可以验证 Persona、Memory 与 Conversation 层最终如何进入 OpenAI-compatible 请求，并安全选择是否携带个人记忆。
- APK 不需要公共存储权限；临时文件位于应用缓存，并通过系统文件 URI 分享。
- 当前快照不写 PostgreSQL，避免在 Prompt Envelope 和保留策略尚未完成前复制大量敏感上下文。
- 页面刷新后必须再次发送消息才能导出。这是刻意的 M1.2 边界，不应以 localStorage 持久化敏感 Prompt 绕过。
