# AI Study Companion 参考项目学习与架构修订报告

> 版本：Research 1.1
> 日期：2026-09-04
> 研究对象：Codex 任务“分析爱语2.9.5程序结构”、DeepSeek Harness、OpenAI Codex 及相关开源项目
> 作用：作为 [`PRODUCT_TECHNICAL_ROADMAP.md`](./PRODUCT_TECHNICAL_ROADMAP.md) 的研究附录与后续架构决策输入

---

## 1. 研究目的

本次研究不是寻找一个可以直接换皮的项目，而是回答五个问题：

1. 一个兼具专业回答、任务提醒、学习引导、内容推荐和情感陪伴的个人 Agent，实际需要哪些系统能力？
2. 爱语 2.9.5 的产品结构对我们的设计有什么启发，又暴露了哪些风险？
3. DeepSeek Harness、OpenAI Codex 和其他开源项目分别解决了哪一层问题？
4. 哪些能力应由我们自己设计，哪些适合采用依赖或进行适配？
5. 原有路线图应当如何调整，才能兼顾学习价值、作品集质量和长期可维护性？

本文只学习公开行为、可观察结构、公开文档和开源实现，不复制闭源应用的代码、资源、角色资产或受限制素材。

---

## 2. 结论摘要

### 2.1 项目定位没有改变，但技术主线更清楚了

本项目不应做成“又一个聊天网页”，也不必追求凭空发明新的 Agent 理论。最适合的定位仍然是：

> 一个以长期个人关系为上下文、以专业回答和学习成长为主要价值、能够可靠执行任务并克制地主动联系用户的个人 AI Companion。

差异化不来自单一功能，而来自五种能力被同一个用户模型统一起来：

- **脑（Mind）**：专业回答、检索、推理、反思与问题生成。
- **记忆（Memory）**：用户偏好、长期目标、承诺、关系边界和可检索经历。
- **手（Actions）**：任务、工具、新闻与书籍管线、未来的外部服务连接。
- **信箱（Inbox）**：离线产生的结果、提醒和主动消息的可靠落点。
- **身体（Embodiment）**：文字风格、语音、表情、桌面形象等可选表达层。

### 2.2 从爱语得到的核心启发

爱语体现的不是单纯 Chat UI，而是“对话 + 主动消息 + 长期记忆 + 外部入口 + 语音/形象 + 模块能力”的组合。它证明这些需求可以形成连贯体验，但也展示了高权限组合、模型输出触发原生动作、明文网络和导入入口可能带来的安全风险。

因此我们应学习它的产品组合，不照搬其权限模型和模块桥接方式。

### 2.3 从开源项目得到的核心启发

- **DeepSeek Harness**：学习 append-only 事件、能力接口、工具管线和后台作业；MVP 不采用“一切皆插件”。
- **OpenAI Codex**：学习 thread/run/event、流式事件、审批和工具执行边界；不把编码 Agent 当作陪伴产品内核。
- **YuriOS**：学习“是否行动”和“是否打扰”两道独立门控，以及持久 Inbox。
- **Warashi / Letta / Mem0**：学习分层记忆、后台整理和检索阶梯；首版不急于引入向量数据库。
- **Trigger.dev**：作为可靠任务执行基础设施候选，与自建 PostgreSQL Claim Scheduler 做一次限时技术验证。
- **Open-LLM-VTuber / sherpa-onnx**：作为语音和形象层的长期参考，不进入当前 MVP 主线。
- **Open WebUI / SillyTavern / LobeHub**：选择性学习多模型、角色、知识库、工具和交互设计，不复制其平台化范围。
- **LangGraph**：只在工作流真正出现分支、暂停、恢复和人工审批时再评估。

### 2.4 本次研究带来的六项架构修订

1. 把“定时任务”和“自主主动行为”拆成两个领域模型。
2. 把“生成工作结果”和“是否/如何通知用户”拆开。
3. 把 Inbox 设为可靠事实源，Push 只是传输渠道。
4. 记忆采用“核心记忆 → 全文检索 → 语义检索”的渐进阶梯。
5. 工具只能通过结构化调用和能力授权执行，禁止解析模型自由文本标签直接调用原生能力。
6. 语音、Live2D 和桌面宠物属于可插拔表达层，不阻塞专业性与任务闭环。

---

## 3. 爱语 2.9.5：从静态分析能确认什么

### 3.1 证据边界

来源任务为 `codex://threads/01a0621d-f619-7450-84a9-81f273a93335`，任务标题为“分析爱语2.9.5程序结构”。其完整静态分析报告位于本机研究目录，不属于本仓库交付物。

分析对象使用了加固壳，核心业务 DEX 并未以可直接阅读的形式暴露。因此本文采用三档置信度：

- **已确认**：来自 Manifest、资源、JNI 库、模型文件或随包样例模块。
- **强推断**：多项静态证据共同指向，但缺少核心代码验证。
- **未确认**：仅能提出假设，不能作为事实或实现依据。

### 3.2 已确认的结构与能力

| 领域 | 静态证据所显示的能力 | 对我们的意义 |
|---|---|---|
| 应用框架 | Android 应用、加固壳、真实 Application 类、主 Activity | 产品可以有独立客户端，但我们当前仍优先完成 Web/PWA 内核 |
| 对话 | AI 对话、上下文或聊天历史相关结构 | 对话是入口，不是全部产品 |
| 主动性 | 主动消息相关组件或资源 | 主动行为需要调度、策略和打扰控制 |
| 外部连接 | 外部接入与微信连接相关能力 | 长期可做多渠道，但必须明确权限和审计 |
| 表达层 | 悬浮窗、桌面宠物、Live2D | “人味”可由持续存在感和多模态表达增强 |
| 语音 | 麦克风、通话、本地 sherpa-onnx ASR 等 | 离线语音存在可行路线，但复杂度高，应后置 |
| 感知 | OCR、截图、无障碍相关能力 | 感知能力价值高，但权限风险同样高 |
| 模块系统 | HTML、QuickJS、原生桥接、指令注册与权限声明样例 | 可以借鉴能力声明，不应让模型文本直接触发高权限动作 |
| 可观测性 | Token、模型、来源、成本和近 30 天统计样例 | 成本与调用来源应成为一等数据，而不是临时日志 |
| 数据能力 | 备份、恢复、导入、更新检查 | 个人数据可迁移很重要，导入面也必须严格校验 |

### 3.3 三个样例模块揭示的设计模式

#### heart_love

模块声明系统提示词注入和指令注册权限，通过 AI 输出约定标签触发动画。这说明“角色行为可以由模型输出驱动”，但自由文本协议容易误触发、被提示注入或产生版本兼容问题。

#### image_downloader

模块具有网络访问、写聊天历史、写应用文件和注册指令等能力，模型输出标签可驱动下载和附件写入。这条链路具有很高风险：

```text
不可信输入 → 模型自由文本 → 标签解析 → 网络请求 → 文件写入 → 对话展示
```

如果我们实现类似能力，必须改造成：

```text
模型结构化工具调用
  → JSON Schema 校验
  → Capability Grant 检查
  → URL/协议/内网地址/重定向校验
  → 大小、MIME、文件名限制
  → 必要时用户确认
  → 沙箱执行
  → 审计记录
```

#### token_viewer

模块统计 prompt、completion、cached、total token，记录模型、来源和成本，并提供近 30 天视图。对本项目的直接启发是建立 `CostLedger`，区分聊天、任务、新闻、记忆整理和主动判断等来源，防止后台能力悄悄失控。

### 3.4 不应复制的风险模式

静态分析观察到的风险包括：

- 可备份范围过宽或规则空泛。
- 允许明文网络通信。
- 无障碍、悬浮窗、全部文件、麦克风、使用情况、设备管理等高权限组合。
- 暴露组件和可浏览导入入口可能缺少足够保护。
- 模块桥接把网络、文件、聊天写入和提示注入能力集中交给脚本。

我们的原则应是：默认无权限、按能力授权、每次执行可审计、敏感动作可确认、导入内容永远视为不可信数据。

---

## 4. 相关开源项目对照

| 项目 | 主要解决层 | 最值得学习 | 不建议直接照搬 | 本项目态度 |
|---|---|---|---|---|
| DeepSeek Harness | Agent Runtime | 事件日志、能力接口、工具管线、后台 Job | 小项目中过早“一切皆插件” | 重点研读，局部吸收 |
| OpenAI Codex | 工具型 Agent | thread/run/event、审批、流式事件、执行隔离 | 编码任务导向的完整产品模型 | 学架构边界，不作内核依赖 |
| Open WebUI | 多模型 AI 平台 | Provider、工具、知识与 UI 组织 | 多用户平台和庞大功能面 | 选择性参考 |
| LobeHub | Agent/知识工作平台 | Next.js 工程、Provider 与 Agent UI | 企业化 Agent 团队范围 | 选择性参考 |
| SillyTavern | 角色对话前端 | 角色卡、Lorebook、Prompt 控制、角色体验 | AGPL 代码和复杂扩展生态 | 学交互与概念，谨慎看许可 |
| Open-LLM-VTuber | 语音/形象 Companion | ASR/TTS/VAD 模块、打断、表情、Live2D | 前端与角色资源存在额外许可约束 | 长期表达层参考 |
| Warashi | 主动陪伴与记忆 | 核心记忆、后台整理、FTS、主动话题、勿扰 | 项目年轻，不能当生产基础 | 重点学习设计，自己实现 |
| YuriOS | 自主 Companion 规范 | 心智循环、两道门控、Inbox、Vault | 规格雄心大、成熟度低 | 作为需求与策略参考 |
| Letta | Stateful Agent | Memory Block、持久状态、后台记忆整理 | 首版引入完整 Agent 平台 | 记忆研究参考 |
| Mem0 | 记忆层 | 多层记忆、实体与混合检索、时间性 | 过早依赖向量基础设施 | 后期评测候选 |
| Trigger.dev | Durable Job | 重试、队列、幂等、等待、Cron、可观测性 | 引入新的运行时和运维复杂度 | 与自建 Scheduler 做 Spike |
| LangGraph | Stateful Workflow | Checkpoint、恢复、人工介入、分支流程 | 单循环阶段的图编排复杂度 | 条件触发后再评估 |
| sherpa-onnx | 本地语音 | 跨平台离线 ASR/TTS/VAD | 模型体积、设备性能与端侧工程 | 语音阶段候选 |

成熟度、许可证和维护状态会变化。采用任何项目之前必须重新核验其最新 Release、Issue、许可证及依赖许可证；“参考”不等于“复制代码”。

---

## 5. 重点项目学习结论

### 5.1 DeepSeek Harness：学习 Runtime，不追求框架炫技

DeepSeek Harness 把模型适配器、工具、会话日志和 Agent Loop 都定义为可替换部件。它最有价值的不是插件数量，而是几个清楚的运行时边界：

- 会话以追加式事件记录为事实来源。
- 持久化 Session Event 和只用于实时展示的运行事件分离。
- 工具执行经过统一管线，而不是散落在 UI 或 Prompt 中。
- 能力通过 Provider/Consumer 接口连接。
- 长任务通过后台 Job 管理，而不是阻塞主循环。

对本项目的应用：

```text
ConversationEvent（持久）  → 重建对话和执行事实
AgentStreamEvent（瞬时）   → 驱动生成中、工具调用中等 UI
TaskRun / ToolRun（持久）  → 记录可重试的后台工作
```

当前不应把所有内部模块改造成插件。只有满足以下任一条件时才抽象接口：

1. 已经有两个真实实现；
2. 涉及安全边界；
3. 需要独立测试或替换；
4. 需要跨进程运行。

### 5.2 OpenAI Codex：审批和事件比“会写代码”更值得借鉴

Codex App Server 的公开定位是让丰富客户端嵌入 Codex，提供认证、会话历史、审批和流式 Agent 事件；自动化与 CI 场景则可使用 Codex SDK。

对我们的启发是：

- 一次用户任务不是单个 HTTP 请求，而是可观察、可暂停、可恢复的 Run。
- 工具执行应产生独立事件，并能请求批准。
- 客户端展示事件，服务端持有真实执行状态。
- 对话历史与运行历史相关，但不是同一张表的同一概念。

本项目不需要嵌入 Codex 作为核心 Companion Runtime。Codex 面向软件工程任务，我们面向长期个人关系和生活/学习任务；可以共享执行模式，不能混淆产品目标。

### 5.3 YuriOS：主动性必须经过两道门

YuriOS 的最重要启发是把主动行为拆成两个判断：

1. `shouldAct`：当前信号是否值得系统花费资源处理？
2. `shouldInterrupt`：即使已经产生结果，是否值得现在打扰用户？

这解决了一个常见错误：把“Agent 想到了一件事”直接等同于“马上给用户发通知”。

建议采用的状态流：

```text
Signal
  → Act Gate
    → Work Run
      → Result / Inbox Item
        → Interrupt Gate
          ├─ 静默存入 Inbox
          ├─ 延迟到合适时段
          └─ 发送 Push / 站内提醒
```

显式定时任务与自主行为不同：用户明确要求的提醒不需要通过 `Act Gate`，但仍遵守用户为该任务选择的通知渠道、安静时段和补偿策略。

### 5.4 Warashi、Letta、Mem0：记忆从小而可控开始

Warashi 的设计采用完整历史落盘、少量核心记忆注入和后台整理；先用 FTS5，再在全文检索不足时考虑向量。Letta 强调状态化 Agent 和可查看的记忆文件；Mem0 展示了用户、会话和 Agent 多层记忆以及混合检索路线。

这支持如下递进实现：

#### Level 0：无自动长期记忆

- 原始对话可查看、可删除。
- 用户手工编辑个人资料和偏好。

#### Level 1：核心记忆

- 只保存稳定、有用、得到用户表达支持的事实。
- 体积严格受限，始终可见、可编辑、可撤销。
- 不把助手对用户的猜测当作事实。

#### Level 2：全文检索

- 对历史消息、任务结果和笔记建立 FTS。
- 先验证中文分词或 trigram 的召回质量。
- 检索结果附来源和时间，不直接改写成永久事实。

#### Level 3：语义/混合检索

- 只有基准测试证明 FTS 无法满足典型问题时才加入 Embedding。
- 需要解决重排、去重、时间衰减、删除传播和成本问题。

#### Level 4：后台反思

- 将长历史整理为可审查候选记忆。
- 候选进入 `proposed`，而不是未经验证直接变成 `accepted`。
- 每条记忆保留证据消息、创建者、置信度和修改记录。

### 5.5 Trigger.dev：可靠任务值得做一次 Build-vs-Buy 实验

Trigger.dev 提供长任务、重试、队列、幂等、Cron、等待、实时订阅和可观测性。它可能显著缩短可靠任务系统的建设时间，但也增加运行时、部署、升级和依赖复杂度。

因此不立即选型，安排一个最长一天的 Spike，对照：

| 维度 | PostgreSQL Claim Scheduler | Trigger.dev |
|---|---|---|
| 学习价值 | 高，可理解租约、幂等和补偿 | 高，可理解成熟 Durable Job 抽象 |
| 初期代码量 | 中到高 | 低到中 |
| 自托管复杂度 | 较低，依赖现有服务 | 取决于部署方式 |
| 重试/等待/队列 | 自己实现 | 内建能力较完整 |
| 可观测性 | 自己建设 | 有现成能力 |
| 锁定程度 | 低 | 中 |
| 适合当前作品集 | 能展示底层理解 | 能展示工程集成与交付速度 |

Spike 必测：关闭网页后运行、时区/DST、重复领取、Worker 崩溃恢复、幂等重试、漏跑补偿、取消、Run 历史和前端实时状态。

### 5.6 Open-LLM-VTuber 与 sherpa-onnx：身体是适配器

Open-LLM-VTuber 展示了 Agent、ASR、TTS、VAD、翻译、Live2D 与 WebSocket 服务的模块化组合，也包含打断、表情映射和主动发言等 Companion 体验。sherpa-onnx 提供跨平台离线语音能力。

我们应保持以下依赖方向：

```text
Persona / Conversation / Agent Runtime
                  ↓ 输出语义与情绪标签
          Embodiment Adapter
          ├─ Text UI
          ├─ TTS / Voice
          ├─ Live2D
          └─ Desktop Widget
```

Agent 核心不能依赖 Live2D、具体 TTS 或某个桌面框架。没有形象和声音时，任务、专业回答和记忆仍须完整工作。

### 5.7 Open WebUI、LobeHub、SillyTavern：只学习各自强项

- 从 Open WebUI 学 Provider、工具、知识库和离线优先的接口组织。
- 从 LobeHub 学 Next.js 产品工程、模型切换和 Agent 工作区交互。
- 从 SillyTavern 学角色卡、Lorebook、场景 Prompt 和角色体验控制。

我们的重点是单用户长期 Companion，不应被多用户管理、模型市场、扩展市场或复杂角色扮演设置拖走。

### 5.8 LangGraph：出现真实复杂工作流后再使用

LangGraph 擅长持久化、有状态、可中断的流程。当以下需求实际出现时再评估：

- 一个 Run 有多个条件分支。
- 工具执行中间需要人工审批。
- 流程等待数小时后继续。
- 失败后从 Checkpoint 恢复，而非从头重跑。
- 多个 Agent 需要明确的控制流。

当前聊天和提醒闭环用确定性的 TypeScript 服务更容易理解、测试和展示。

---

## 6. 修订后的概念架构

```text
┌──────────────────── Experience Layer ────────────────────┐
│ Chat · Tasks · Inbox · Review · Memory Inspector · PWA   │
└──────────────────────────┬─────────────────────────────────┘
                           │ API / SSE
┌──────────────────── Application Layer ───────────────────┐
│ ConversationService  TaskService  ContentService          │
│ MemoryService        ProactivityService  DeliveryService  │
└──────────────────────────┬─────────────────────────────────┘
                           │ commands / events
┌────────────────────── Agent Runtime ─────────────────────┐
│ Run Loop · Prompt Policy · Tool Registry · Approval       │
│ Retrieval · Verification · Cost Ledger · Stream Events    │
└───────────────┬───────────────────────┬────────────────────┘
                │                       │
┌──────── Durable Work ────────┐  ┌──── Integrations ───────┐
│ Scheduler · Queue · Worker   │  │ LLM · Search · RSS      │
│ Retry · Idempotency · Lease  │  │ Push · Email · Voice    │
└───────────────┬──────────────┘  └─────────────────────────┘
                │
┌──────────────────── Data & Audit ─────────────────────────┐
│ PostgreSQL · Event/Run History · Inbox · Memory · Grants   │
│ Tool Audit · Content Sources · Feedback · Cost Usage       │
└────────────────────────────────────────────────────────────┘
```

这不是要求立即拆微服务。MVP 仍使用 Next.js 模块化单体，Scheduler/Worker 可以作为同仓库独立进程部署。边界先体现在模块、类型、数据库和测试中。

---

## 7. 关键领域拆分

### 7.1 Scheduled Task：用户明确授权的确定性承诺

例子：“每周日 20:00 提醒我复盘。”

- 有明确计划、时区和通知策略。
- 到期应运行，不需要模型重新决定值不值得。
- 必须支持幂等、重试、取消、补偿和运行历史。
- 普通文本提醒默认不调用 LLM。

### 7.2 Proactive Signal：系统观察到的非确定性机会

例子：“用户三天没有继续学习计划，是否温和问候？”

- 信号不等于任务，更不等于通知。
- 经过规则和模型共同判断。
- 有每日预算、冷却时间、安静时段和未读抑制。
- 用户可以查看“为什么联系我”并降低相似主动行为。

### 7.3 Work Product：后台产生的结果

例子：日报、书单、任务总结、反思问题。工作结果先可靠保存，再决定是否打扰用户。

### 7.4 Delivery：结果如何抵达用户

同一结果可以：

- 只进入 Inbox。
- 下一次打开应用时展示。
- 在用户允许的窗口发送 Push。
- 与每日摘要合并，避免多次打扰。

### 7.5 Embodiment：表达结果，不掌控业务

声音、表情和虚拟形象消费 Agent 的结构化表达数据，但不能直接改写任务、记忆和权限。

---

## 8. 建议新增的数据模型

以下为概念字段，最终以数据库迁移和 ADR 为准。

```ts
type AutonomySignal = {
  id: string;
  userId: string;
  kind: "inactivity" | "goal_risk" | "content_ready" | "follow_up";
  occurredAt: string;
  evidence: Record<string, unknown>;
  dedupeKey: string;
  status: "pending" | "ignored" | "acted";
};

type ProactiveDecision = {
  id: string;
  signalId: string;
  shouldAct: boolean;
  actReason: string;
  shouldInterrupt: boolean;
  interruptReason: string;
  score: number;
  policyVersion: string;
  decidedAt: string;
};

type Delivery = {
  id: string;
  userId: string;
  sourceType: "task_run" | "content_run" | "proactive_run";
  sourceId: string;
  channel: "inbox" | "web_push" | "email";
  status: "pending" | "sent" | "failed" | "suppressed";
  scheduledFor: string;
  sentAt?: string;
  suppressionReason?: string;
  idempotencyKey: string;
};

type CapabilityGrant = {
  id: string;
  subjectType: "builtin_tool" | "user_module" | "connector";
  subjectId: string;
  capability:
    | "network.fetch"
    | "conversation.write"
    | "files.write"
    | "prompt.extend"
    | "notification.send"
    | "memory.propose";
  scope: Record<string, unknown>;
  approval: "always" | "once" | "never";
  revokedAt?: string;
};

type ToolAudit = {
  id: string;
  runId: string;
  toolName: string;
  argumentsDigest: string;
  grantId?: string;
  approvalId?: string;
  startedAt: string;
  finishedAt?: string;
  outcome: "success" | "denied" | "failed";
  errorCode?: string;
};

type CostLedger = {
  id: string;
  runId: string;
  source: "chat" | "task" | "content" | "memory" | "proactivity";
  provider: string;
  model: string;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  estimatedCostMicros?: number;
  createdAt: string;
};
```

数据库还应为 Inbox Item、Memory Evidence、Persona Asset、Approval 和 Run Event 建立独立模型。不要把这些内容塞进一个通用 JSON 会话对象。

---

## 9. 工具与模块安全规范

### 9.1 结构化调用

- 模型只能输出注册工具名和符合 JSON Schema 的参数。
- 自由文本、Markdown、XML 标签或角色台词不得直接触发系统动作。
- 工具结果作为不可信数据进入上下文，不得覆盖系统策略。

### 9.2 能力最小化

- 工具注册不等于自动授权。
- 网络权限细分到域名、协议、方法和响应上限。
- 文件权限限定到应用管理目录和允许的 MIME。
- Prompt 扩展与系统 Prompt 修改不是普通插件权限。
- 写记忆默认只能创建候选，不能静默确认为用户事实。

### 9.3 网络防护

- 只允许 HTTPS，除非开发环境有明确例外。
- 拒绝 localhost、链路本地、私网、云元数据地址和 DNS 重绑定结果。
- 每次重定向重新验证目标。
- 限制超时、响应体大小、内容类型和下载次数。

### 9.4 导入与第三方角色

- 导入的角色卡、Prompt、脚本和知识文件默认禁用主动能力。
- 导入后显示权限摘要并要求用户审核。
- 任何导入文本都不能声明自己拥有更高权限。
- 角色设定可以导出；关系记忆、密钥、审批记录默认不可随角色导出。

### 9.5 审计与撤销

- 每次工具调用记录 Run、参数摘要、权限依据、结果和耗时。
- 用户可以按工具或连接器撤销授权。
- 删除数据必须传播到索引、摘要和备份策略中。

---

## 10. 主动联系策略规范

### 10.1 两道门控

```ts
interface ActGateInput {
  signal: AutonomySignal;
  userState: {
    recentActivityAt?: string;
    unreadCount: number;
    proactiveCountToday: number;
  };
  policy: {
    dailyBudget: number;
    cooldownMinutes: number;
    enabledKinds: string[];
  };
}

interface InterruptGateInput {
  importance: number;
  urgency: number;
  userLocalTime: string;
  quietHours: { start: string; end: string };
  unreadCount: number;
  explicitDeliveryRequest: boolean;
}
```

`ActGate` 可先采用确定性规则，模型只负责边界判断和文案。`InterruptGate` 应以规则为主，安静时段、每日上限和用户关闭选项属于硬限制，模型不得绕过。

### 10.2 默认策略

- 首版每日最多一次非用户显式要求的主动联系。
- 有未读主动消息时不继续发送同类消息。
- 不因用户没有回复而表达受伤、责备或施加负罪感。
- 专业回答模式下不强行加入亲密称呼和冗余情绪表达。
- 每条主动消息提供原因和快速反馈：有帮助、太频繁、不感兴趣。

### 10.3 高质量问题的触发条件

问题不是随机的“每日一问”，而应基于：

- 用户刚完成的任务或学习内容。
- 用户目标与近期行为之间的差距。
- 对话中仍未澄清的重要假设。
- 新闻或书籍与用户既有观点之间的张力。

每个问题应能说明来源，避免伪装成对用户内心的确定判断。

---

## 11. 新闻与书籍管线的进一步设计

### 11.1 新闻不是一次搜索，而是可追踪的内容任务

```text
Source Fetch
 → Normalize
 → Deduplicate / Event Cluster
 → Source Quality Filter
 → Fact Summary + Viewpoint Separation
 → Personal Relevance Ranking
 → Save Work Product
 → Delivery Decision
```

关键要求：

- 区分事件发生时间与文章发布时间。
- 事实和评论分开呈现。
- 一个重要事件尽量使用多个独立来源。
- 摘要保留原文链接、来源、时间和不确定性。
- 用户画像只影响排序，不应把不同立场完全过滤掉。
- 没有有价值内容时允许静默，不为完成配额而凑数。

### 11.2 书籍推荐必须解释“为什么是现在”

推荐记录至少包含：

- 与当前目标或问题的关系。
- 难度、预估投入和适合的阅读方式。
- 推荐依据来自公开书目信息、可信评论还是用户既有偏好。
- 与已读/已推荐内容的去重关系。
- 可选的阅读计划和一至三个思考问题。

版权原则：保存元数据、用户笔记和合规摘录，不抓取或重新分发受版权保护的完整图书内容。

---

## 12. Build、Borrow 与 Study 的边界

### 12.1 必须自己设计和实现

- 用户目标、任务、Inbox 和回顾闭环。
- 专业模式与陪伴模式的冲突解决策略。
- 主动联系两道门控、预算和反馈。
- 记忆准入、证据、编辑、遗忘和删除机制。
- 能力授权、审批和工具审计。
- 新闻/书籍的个人相关性与质量标准。

这些构成本项目真正的作品集价值。

### 12.2 可以采用成熟依赖

- PostgreSQL 与 ORM/迁移工具。
- 标准队列或 Durable Job 基础设施。
- Web Push、邮件和 RSS 解析库。
- 搜索、LLM、Embedding、ASR 和 TTS Provider SDK。
- 认证、日志、Tracing 和指标基础设施。

采用依赖仍需建立我们自己的 Adapter，避免领域层绑定单一供应商。

### 12.3 只学习、不形成早期依赖

- DeepSeek Harness 的完整插件体系。
- Letta/Mem0 的完整 Memory 平台。
- LangGraph 的完整工作流编排。
- Open WebUI/LobeHub 的多用户平台能力。
- Open-LLM-VTuber 的完整前端和角色资源。
- SillyTavern 的扩展生态。

---

## 13. 后续实验计划

### 实验 A：Scheduler 技术 Spike（1 天）

分别用最小 PostgreSQL Claim Worker 和 Trigger.dev 完成同一条任务：

> 创建 2 分钟后的提醒，关闭页面，故意让 Worker 在执行中崩溃，再恢复且只产生一次 Inbox Item。

交付：对比 ADR、测试记录、部署复杂度和最终选型建议。

### 实验 B：记忆检索基准（2 天）

构造至少 100 段中文对话和 30 个问题，对比：

1. 仅核心记忆；
2. 核心记忆 + FTS；
3. 核心记忆 + FTS + Embedding。

指标：Recall@5、错误记忆注入率、平均上下文 Token、延迟和成本。没有数据证明前，不加入向量数据库。

### 实验 C：主动性模拟器（1–2 天）

用虚拟时间生成一周的活动、未读、任务和内容信号，验证：

- 每日预算和冷却是否有效。
- 安静时段是否绝不被自主消息突破。
- 产生结果但不打扰时，Inbox 是否仍完整。
- 明确提醒和自主关怀是否走不同策略。

### 实验 D：工具安全红队（2 天）

测试恶意 URL、私网地址、重定向、超大响应、伪造 MIME、路径穿越、Prompt Injection、重复确认和权限撤销。目标不是“模型看起来拒绝”，而是系统层强制失败并留下审计记录。

### 实验 E：语音延迟预算（长期阶段前，1 天）

只做技术原型，测量 VAD、ASR、LLM 首 Token、TTS 首音频和总打断恢复时间。若完整体验无法稳定，不把语音纳入核心演示。

---

## 14. 修订后的 30/60/90 天学习与开发路线

### 0–30 天：可靠内核

目标：聊天状态稳定，第一条后台任务闭环完成。

1. 修复现有 Runtime 状态一致性和消息模型问题。
2. 为 Conversation、Message、Runtime 和 Memory 增加测试。
3. 完成 Scheduler Spike 并记录 ADR。
4. 建立 PostgreSQL 的 Conversation、Message、Task、TaskRun、InboxItem。
5. 服务端执行模型请求，前端通过 SSE 接收事件。
6. 完成“关闭网页后仍能运行”的文本提醒。

验收：同一任务不会重复提醒；每次运行可追踪；刷新页面不丢状态；失败可重试。

### 31–60 天：专业能力与可控记忆

目标：回答更可信，长期上下文开始有用且可管理。

1. 实现 Search → Source → Answer → Citation 管线。
2. 建立小型核心记忆和 Memory Inspector。
3. 完成中文 FTS 基准，再决定是否加入向量。
4. 建立结构化 Tool Registry、Capability Grant 和 Audit。
5. 增加 CostLedger，按功能统计 Token、延迟和成本。
6. 实现任务完成后的复盘问题生成。

验收：关键事实有来源；用户可查看和纠正记忆；工具越权被系统拒绝；成本来源可解释。

### 61–90 天：内容服务与克制主动性

目标：系统开始在用户不打开聊天页时产生持续价值。

1. 实现新闻抓取、去重、事件聚类和来源质量规则。
2. 实现书籍元数据、推荐理由和阅读反馈。
3. 增加 AutonomySignal、Act Gate 和 Interrupt Gate。
4. 建立 Inbox、摘要合并、安静时段、预算和冷却。
5. 用主动性模拟器和真实使用反馈调参。
6. 完成作品集演示脚本、架构图、风险说明和 Evals 报告。

验收：主动消息有明确原因、可控频率、不违反安静时段；新闻和书籍推荐可追溯且不重复。

### 90 天以后：表达层与连接器

- PWA Push 与移动快捷入口。
- 日历、Todo、RSS、笔记等连接器。
- 语音、打断和离线 ASR/TTS 实验。
- 可选桌面小组件或 Live2D Adapter。
- 多设备同步和本地优先 Vault。

---

## 15. 建议新增的 ADR

在原规划 ADR-001 至 ADR-008 基础上增加：

1. **ADR-009：主动行为采用 Act Gate 与 Interrupt Gate 两阶段决策。**
2. **ADR-010：工具只接受结构化调用，禁止自由文本标签触发能力。**
3. **ADR-011：Inbox 是后台结果的事实源，通知是可失败的 Delivery。**
4. **ADR-012：记忆采用 Core → FTS → Semantic 的检索阶梯。**
5. **ADR-013：语音与虚拟形象作为 Embodiment Adapter。**
6. **ADR-014：通过限时 Spike 选择 PostgreSQL Claim 或 Durable Job 平台。**
7. **ADR-015：所有外部内容默认不可信，进入上下文前保留来源与信任标记。**

---

## 16. 源码阅读顺序

不要漫无目的地浏览仓库。按我们当前问题逐项阅读：

### 第一轮：Runtime 与事件

1. DeepSeek Harness 的 `docs/architecture.md`。
2. 会话事件、Agent Loop、工具管线和后台 Job 相关目录。
3. Codex App Server 的协议、会话、审批和事件文档。

输出：一页 Event Taxonomy，明确哪些事件持久化、哪些只用于 UI。

### 第二轮：任务可靠性

1. Trigger.dev 的 task、queue、retry、wait、schedule 和 idempotency 示例。
2. 对照 PostgreSQL `FOR UPDATE SKIP LOCKED`、Lease 和唯一约束方案。

输出：ADR-014 和可运行的故障恢复测试。

### 第三轮：记忆

1. Warashi 的 `MEMORY_SYSTEM_DESIGN.md` 与核心记忆实现。
2. Letta 的 Memory Block / MemFS 概念。
3. Mem0 的抽取、实体、时间和混合检索设计。

输出：记忆基准数据集、MemoryCandidate Schema 和人工审查页面草图。

### 第四轮：主动性

1. YuriOS 的心智循环、预算、Inbox 和中断策略。
2. Warashi 的主动话题、睡眠/勿扰与新闻相关实现。

输出：纯函数化的 Act/Interrupt 策略和虚拟时间测试。

### 第五轮：表达层

1. Open-LLM-VTuber 的 `agent`、`asr`、`tts`、`vad`、WebSocket 和 Service Context。
2. sherpa-onnx 的目标平台示例和模型许可。

输出：只定义 Adapter 和延迟预算，不进入核心代码，直到 90 天主线完成。

---

## 17. 作品集表达建议

项目价值应通过可验证的工程故事呈现：

- 为什么浏览器定时器不可靠，以及如何通过 Scheduler/Worker/Inbox 修复。
- 为什么“产生内容”和“打扰用户”是两个不同决策。
- 为什么记忆不是简单把所有历史塞给模型。
- 如何防止模型文本直接触发网络和文件操作。
- 如何用 Evals、成本账本和审计证明 Agent 行为受控。
- 如何让人格层增强体验但不降低专业回答质量。

最终 Demo 仍建议围绕一条完整旅程：

> 用户用自然语言建立每周复盘任务；关闭网页后任务可靠执行；系统结合过去一周记录生成有来源的摘要和一个高质量问题；结果进入 Inbox，并在合适时间通知；用户的回答更新为可审查的候选记忆，而不是被静默永久保存。

这比展示大量未完成入口更能体现产品思考、后端可靠性、Agent 安全、前端体验和评测能力。

---

## 18. 参考链接

### 运行时与 Agent

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [OpenAI Codex](https://github.com/openai/codex)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server)
- [OpenAI Codex SDK](https://developers.openai.com/codex/sdk)
- [LangGraph](https://github.com/langchain-ai/langgraph)

### Companion、角色与表达层

- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)
- [Warashi](https://github.com/inni918/warashi)
- [Warashi Memory System Design](https://github.com/inni918/warashi/blob/main/MEMORY_SYSTEM_DESIGN.md)
- [YuriOS](https://github.com/yuri-os/YuriOS)
- [YuriOS Specification](https://github.com/yuri-os/YuriOS/blob/main/SPEC.md)
- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)

### 记忆、平台与任务

- [Letta](https://github.com/letta-ai/letta)
- [Mem0](https://github.com/mem0ai/mem0)
- [Open WebUI](https://github.com/open-webui/open-webui)
- [LobeHub](https://github.com/lobehub/lobehub)
- [Trigger.dev](https://github.com/triggerdotdev/trigger.dev)
- [ChatGPT Scheduled Tasks](https://learn.chatgpt.com/docs/automations)

### 移动端与自托管

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Capacitor Android](https://capacitorjs.com/docs/android)
- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports)
- [Docker Compose](https://docs.docker.com/compose/)
- [Tailscale Documentation](https://tailscale.com/kb/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)

---

## 19. 最终判断

这些项目与我们“相似”，但没有一个与我们的目标完全相同：

- Harness、Codex、LangGraph 更接近执行内核。
- Trigger.dev 更接近可靠后台任务。
- Letta、Mem0、Warashi 更接近记忆。
- Open-LLM-VTuber、SillyTavern 更接近人格与表达。
- Open WebUI、LobeHub 更接近通用 AI 工作台。
- YuriOS 更接近一份自主 Companion 的系统规格。

我们的项目价值在于把这些层缩小、约束并整合到一个真实个人使用场景中。最重要的创新不必是新算法，而可以是高质量的系统取舍：可靠而不过度主动，温暖而不操纵，记得住但可纠正，能行动但有边界，专业回答时仍然专业。

---

## 20. 最新需求修订：学习插件与移动端自托管

### 20.1 决策变化

此前结论是“MVP 不采用一切皆插件”，该判断仍然成立；但“插件需求尚未稳定”的前提已经变化。用户已明确提出背书与解题两个真实且边界不同的学习活动，因此项目应从近期架构开始保留最小插件协议。

新的决策不是复制 DeepSeek Harness 的完整插件树，而是：

> 核心保持模块化单体；学习扩展通过受控的 Skill、Tool、Activity、Connector Contribution 注册；先实现两个第一方插件，验证后再开放本地第三方安装。

### 20.2 Skill 与 Plugin 分离

- **Skill**：声明式 Prompt、教学规则、评分标准和示例，不执行任意代码。
- **Tool Plugin**：提供结构化输入输出的 OCR、计算、搜索或数据处理能力。
- **Activity Plugin**：组合专用 UI、Skill、Tool、任务与学习记录，形成背书或解题闭环。
- **Connector Plugin**：连接日历、Todo、笔记、RSS 或电子书目录等外部服务。

声明式 Skill 默认风险较低，可优先开放；可执行 Plugin 必须经过兼容性检查、权限确认、隔离执行、配额、审计和撤销。

### 20.3 Harness 经验的具体采用边界

采用：

- Provider/Consumer 式能力边界。
- 统一 Registry 与生命周期。
- 持久事件与瞬时运行事件分离。
- 后台 Job 不阻塞对话循环。
- 插件通过宿主上下文消费能力，而非导入内部实现。

暂不采用：

- 所有核心组件都动态插件化。
- 任意插件树、Profile/Bundle 和热重载。
- 通用 Shell、远程代码执行和多 Agent 插件。
- 公共市场、评分、付费和自动安装。

### 20.4 第一方插件验证

背书插件必须验证：材料导入、知识单元、用户校对、复述评分、学习记录、间隔复习和 Task 请求。

解题插件必须验证：文字/图片输入、题目分类、提示/引导/检查/完整讲解策略、工具验证、错因记录，以及通过公开能力请求生成复习卡。

只有两个插件都能在不修改 Agent Loop、不直接访问数据库且可被安全禁用的情况下完成闭环，才能冻结 Plugin API v1。

### 20.5 Android 与插件的边界

产品采用 Web-first + Capacitor-ready 路线。同一套 React/TypeScript 客户端运行在 Web/PWA 与 Android APK，平台差异通过 Storage、Secure Storage、Notification、File、Share 等 Adapter 隔离。

动态产品插件可以运行在笔记本/云端服务端或沙箱 Web UI；Android 相机、麦克风、通知和文件等原生能力必须预编译进 APK。插件只能申请调用这些能力，不能在安装后加入新的原生代码或系统权限。

### 20.6 笔记本自托管与迁移

笔记本可在单用户阶段运行 Web/API、Scheduler、Worker 和 PostgreSQL，APK 通过经过认证的 HTTPS 或私有网络访问。笔记本离线时服务端任务暂停，本地提醒继续工作；恢复后运行补偿扫描。

部署使用可移植容器、环境变量、数据库迁移和备份恢复。未来迁移云端只更换运行环境、数据库连接、附件存储和域名，领域模型、插件协议与客户端 API 保持不变。
