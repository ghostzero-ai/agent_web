# ADR-051：服务端结构化 Persona 与专业策略隔离

- 状态：Accepted
- 日期：2026-09-27
- 对应：Phase 5.3

## 背景

项目需要稳定、自然、可由用户调整的“人味”，但旧 Prompt Builder 只有一段固定 Persona 文本，而且由客户端发送。若开放任意自定义人设 Prompt，会造成规则膨胀、注入风险和多端不一致，也无法保证人格不会为了安慰用户而降低事实标准。

## 决策

1. 新增与固定单用户一对一的 `persona_profiles`，保存助手称呼、可选用户称呼，以及温暖、幽默、直接、篇幅、对话内引导五个 0–100 维度。
2. 不保存任意 Persona Prompt。服务端使用确定性编译器把结构化字段转换成短小稳定的 Relationship Style 层，并固定附加专业与情感边界。
3. 模型端点每次从数据库读取最新画像，删除客户端提交的所有 `persona` 层，再插入唯一服务端 Persona。顺序保持 `Policy → Mode → Persona → Memory/Web Search → Conversation`。
4. Persona 只能改变措辞、篇幅与当前对话节奏。事实、证据、置信度、引用、安全和高风险提示由上层策略控制；严肃场景禁用幽默。
5. `initiative` 只控制当前已打开对话中的追问倾向。后台主动联系、安静时段、预算和触发理由由 Phase 5.5 的 Proactivity Policy 单独实现。
6. 称呼只接受名称类字符并限制长度；API 不接受自定义规则数组，避免把结构化配置退化成自由 Prompt 编辑器。

## 结果

- Web 与 APK 使用同一服务端画像，修改后下一次回答立即生效。
- Prompt Envelope 和安全导出记录模型真正收到的 Persona 层，版本为 `persona-profile/v1`。
- 用户不能从客户端伪造更高优先级的人格指令；Core 3.5 的 25 个专业/模式契约继续通过。
- 代价是本阶段表达能力受五个维度限制，但更容易测试、迁移与后续版本化。

## 回滚

迁移 `0018_persona_profile` 的回滚会删除 `persona_profiles`。代码回退后 Prompt Builder 使用内置默认 Persona；回滚前应导出需要保留的个人称呼与数值设置。
