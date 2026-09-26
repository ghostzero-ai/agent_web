# ADR-042：服务端 Prompt Envelope、无明文审计与校验导出

- 状态：Accepted
- 日期：2026-09-26

## 背景

M1.2 会在客户端构造 Prompt 后保存运行期快照，能够导出实际消息，但服务端只看到扁平的 Provider 消息，无法证明层来源、版本和导出内容与真实 Run 一致。把完整 Prompt 长期写入数据库又会复制个人记忆和私密对话，扩大备份泄露面。

## 决策

1. Chat 向模型端点提交结构化 `PromptMessage[]`、触发方式和会话分支，而不是自行降级为 Provider 消息。服务端是 Prompt Envelope 的唯一生成者，并由 Envelope 中的 `request.messages` 调用 Provider。
2. Envelope v1 包含 Run ID、创建时间、会话与活动分支、Composer 版本、层顺序与逐层版本、Provider/Model/Base URL、实际请求、生成参数、工具定义、上下文截断状态、隐私声明和 SHA-256。
3. PostgreSQL `prompt_runs` 只保存 Run ID、会话/分支、版本、Provider 元数据、消息数、是否含记忆、状态、错误码和内容哈希；不保存 Prompt、记忆或对话正文。
4. 普通发送必须绑定数据库当前活动叶节点；重新生成允许绑定该会话中的历史节点，以保留树形分支语义。不存在或跨会话的节点被拒绝。
5. 完整 Envelope 只随本次 SSE `meta` 事件返回客户端运行内存。刷新后不会从数据库恢复 Prompt 明文。
6. JSON/Markdown 导出改由服务端生成。客户端提交本次 Envelope、格式和记忆授权；服务端重新计算 SHA-256，并与本地用户的 Run 审计记录逐项核对。篡改或不存在的 Run 拒绝导出。
7. 记忆层默认替换为脱敏占位符；只有用户显式确认后才进入导出文件。API Key、数据库凭据、Push Token、内部错误栈和不可导出的插件私有数据始终排除。

## 后果

- Provider 实际收到的消息和可导出的 Envelope 共享同一服务端事实来源。
- Run 审计可长期保留并验证完整性，同时数据库备份不新增完整 Prompt 明文。
- 页面刷新后仍不能重新导出旧 Run 的完整内容；这是“不保存 Prompt 明文”的直接代价，而不是数据丢失缺陷。
- 当前 generation 明确记录 `temperature=null`、`tools=[]`，Context 记录未截断/未压缩。未来加入工具、截断或压缩时必须升级 Composer/层版本并保持旧导出可解释。
