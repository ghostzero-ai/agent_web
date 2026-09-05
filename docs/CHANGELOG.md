# CHANGELOG

本文档记录 AI Study Companion 项目所有 Sprint 的变更历史。

---

## Sprint 0.6 — 依赖安全与 Phase 0 封版

**Commit**: `c57a612`

### 修改文件
- `web/package.json`
- `web/package-lock.json`
- `web/AGENTS.md`
- `PROJECT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| Next.js 安全升级 | 将 Next.js 与 `eslint-config-next` 从 `16.2.9` 升级并固定到 `16.3.4`，修复 App Router、Turbopack、Server Actions 及传递依赖公告 |
| 传递依赖修复 | 使用不带 `--force` 的兼容补丁升级，修复 PostCSS、Sharp、Nano ID、Browserslist、JS-YAML 与 Brace Expansion 等公告 |
| 框架规则同步 | 接受 Next.js 16.3.4 首次启动时自动更新的 `web/AGENTS.md` 规则块，避免每次开发启动产生脏工作区 |
| Phase 0 封版 | 路线图将 Sprint 0.6 标记完成，项目状态转入 Phase 1 准备阶段，并建立 `phase-0-baseline` Git 标签 |

### 验证
- `npm audit`：生产与开发依赖均为 0 项已知漏洞
- `npm test`：7 个测试文件、44 个测试全部通过
- `npx tsc --noEmit --pretty false`：通过
- `npm run lint`：通过
- `npm run build`：通过，4 个静态路由成功生成
- `npm run test:e2e`：3 个 Microsoft Edge 端到端测试全部通过
- localStorage 键值：无变化

### Phase 0 基线
- 基线标签：`phase-0-baseline`
- 回滚方式：`git switch --detach phase-0-baseline` 可只读检查封版状态；需要开发时应从该标签创建新分支
- 下一 Sprint：1.1 PostgreSQL + Drizzle + migration 基线

---

## Sprint 0.5.1 — KaTeX 分数排版兼容修复

**Commit**: `8534c3a`

### 修改文件
- `web/package.json`
- `web/package-lock.json`
- `web/e2e/chat.spec.ts`

### 变更内容
| 功能 | 说明 |
|------|------|
| KaTeX 版本一致性 | 将直接依赖从 `0.18.5` 固定为 `0.16.47`，与 `rehype-katex` 和 `remark-math` 实际使用的版本一致 |
| 依赖去重 | 移除两份嵌套 KaTeX 运行时，确保生成公式 DOM 的代码与页面载入的 CSS、字体来自同一版本 |
| 分数回归测试 | Edge 页面用例新增普通分数与嵌套分数，验证行内、块级公式及 `.mfrac` 结构均能渲染 |

### 验证
- `npm test`：44/44 通过
- `npm run lint`：通过
- `npm run test:e2e`：3/3 用例通过（Edge）
- `npm run build`：通过
- localStorage 键值：无变化

---

## Sprint 0.5 — 树形对话与安全富文本渲染

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/conversation/tree.ts`
- `web/lib/ai/messages.ts`
- `web/lib/config.ts`
- `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/lib/agent/promptBuilder.ts`
- `web/lib/agent/dispatcher.ts`
- `web/app/chat/page.tsx`
- `web/app/layout.tsx`
- `web/app/globals.css`
- `web/components/chat/MessageList.tsx`
- `web/components/chat/MarkdownMessage.tsx`
- `web/tests/conversationTree.test.ts`
- `web/tests/chatService.test.ts`
- `web/tests/backend.test.ts`
- `web/tests/chatComponents.test.tsx`
- `web/e2e/chat.spec.ts`
- `web/package.json`
- `web/package-lock.json`
- `docs/adr/ADR-023-CONVERSATION-TREE-AND-RICH-CONTENT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 树形消息 | 新增 `parentId`、`schemaVersion` 和 `activeLeafId`，以消息父子关系表达真实对话分支 |
| 历史 Retry | 重新生成任意 Assistant 回答会创建兄弟节点，新分支不会继承旧回答的后续消息 |
| 分支恢复 | 切回旧回答版本时恢复其已有后续路径；再次切换新版本时旧路径保持隐藏但不删除 |
| Prompt 一致性 | Provider 与记忆压缩只读取当前活动路径，不再混入其他分支内容 |
| 旧数据迁移 | 线性消息转为父子链，旧 `versions[]` 转为兄弟节点，原 active 版本承接后续 |
| Markdown | 新增 CommonMark、GFM、代码块和安全外链渲染 |
| 数学公式 | 使用 `remark-math` 与 `rehype-katex` 支持行内和块级 LaTeX |
| 定界符兼容 | 在 Markdown 解析前将 prose 中的 `\\(...\\)` / `\\[...\\]` 转换为 KaTeX 可识别格式，代码区保持原样 |
| HTML 边界 | 不启用原始 HTML 解析；HTML 代码默认只展示，不进入宿主 DOM 执行 |
| 架构决策 | ADR-023 固化数据库映射、ContentBlock/Artifact 方向和 iframe 沙箱要求 |

### localStorage 变化
- 键名保持 `agent_chat_sessions` 不变。
- Session 值升级为 `schemaVersion: 2`，消息增加 `parentId`，Session 增加 `activeLeafId`。
- 首次读取旧数据时自动迁移并回写；旧 active 版本继续承接原后续消息，其他版本转为兄弟叶节点。

### 项目结构快照
```text
web/
├── app/                       # 页面、全局样式与根布局
├── components/chat/           # Chat 展示组件与 Markdown 渲染器
├── e2e/                       # Playwright 浏览器主链路
├── lib/
│   ├── agent/                 # Prompt、Memory、Compressor、Dispatcher
│   ├── ai/                    # Provider 适配与消息传输类型
│   ├── conversation/          # 树形会话领域操作
│   └── runtime/               # Browser Backend 与任务事件
└── tests/                     # 单元与组件渲染测试
```

### 验证
- `npm test`：7 个测试文件、44 个测试全部通过。
- `npm run test:e2e`：3 个 Microsoft Edge E2E 测试通过，覆盖历史分叉、路径恢复和真实页面公式渲染。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过且无警告。
- `npm run build`：通过，4 个静态路由成功生成。
- `npm audit --omit=dev`：新增渲染依赖未增加生产公告；仍为 Next.js 16.2.9 链路的 4 个既有高危项，留待 Sprint 0.6。

### 范围说明
- 本 Sprint 不执行模型返回的 HTML；可运行网页将作为独立 Artifact 和沙箱预览在后续实现。
- 本 Sprint 不引入数据库；树形领域模型与 localStorage 解耦，Phase 1 将映射到 `parent_message_id`。
- Next.js 16.2.9 的既有生产依赖安全升级安排在 Sprint 0.6。

---

## Sprint 0.4 — Chat 页面组件化

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/app/chat/page.tsx`
- **新建** `web/components/chat/ChatHeader.tsx`
- **新建** `web/components/chat/ChatErrorBanner.tsx`
- **新建** `web/components/chat/SessionSidebar.tsx`
- **新建** `web/components/chat/MessageList.tsx`
- **新建** `web/components/chat/ChatComposer.tsx`
- **新建** `web/tests/chatComponents.test.tsx`
- **新建** `web/e2e/chat.spec.ts`
- **新建** `web/playwright.config.ts`
- `web/vitest.config.ts`
- `web/.gitignore`
- `web/package.json`
- `web/package-lock.json`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 页面容器 | `ChatPage` 仅保留 Session 选择、任务状态、AI 调用和领域操作编排 |
| 展示组件 | Header、错误提示、会话侧栏、消息列表和输入区拆为独立组件 |
| 状态边界 | Session 与 Backend 仍由页面容器统一连接，展示组件只通过类型化 Props 接收数据与操作 |
| 客户端边界 | 复用页面顶层的 Client Component 边界，子组件不重复声明 `use client` |
| 行为保持 | 保留新建/删除会话、发送/停止、Retry、回复版本切换及所有原有样式和文案 |
| 组件回归 | 静态渲染测试覆盖 Header、错误、侧栏空状态、消息空状态、版本导航、Retry、加载态和输入区模式 |
| E2E 基线 | 引入 Playwright 并复用本机 Edge，覆盖新建、刷新恢复、配置校验、删除及空状态持久化主链路 |

### 验证
- `npm test`：6 个测试文件、37 个测试全部通过。
- `npm run test:e2e`：1 个 Microsoft Edge 端到端测试通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。

### 范围说明
- 本 Sprint 只调整展示层结构，不改变 Session 数据模型、持久化方式、Prompt、Memory 或 Provider 行为。
- E2E 使用空白 localStorage 和缺失 API 配置运行，不读取用户密钥，也不会向模型 Provider 发送请求。
- Next.js 16.2.9 的既有安全升级任务仍待独立处理。

---

## Sprint 0.3 — 核心单元测试基线

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/config.ts`
- `web/lib/runtime/backend.ts`
- `web/lib/agent/dispatcher.ts`
- `web/tests/config.test.ts`
- `web/tests/chatService.test.ts`
- `web/tests/backend.test.ts`
- **新建** `web/tests/memory.test.ts`
- **新建** `web/tests/helpers/browserStorage.ts`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 配置测试 | 覆盖完整/缺失 API 配置、损坏 JSON、空 Session、旧消息迁移和非法消息过滤 |
| 消息校验 | 新增 `isChatMessage`、`isSession` 运行时类型守卫，持久层不再盲目信任类型断言 |
| Chat Service | 覆盖 Provider 请求、缺失配置、HTTP 错误、空回复、发送回复、Retry 版本与不可变性 |
| Backend 生命周期 | 覆盖 running/done/error/aborted 事件、完成 Hook、取消和异步删除安全 |
| 领域边界 | 通用 Backend 不再把任意含 `id` 的结果当作 Session；Dispatcher 验证后再请求写入 |
| Memory 测试 | 覆盖排序、去重、清空、损坏存储恢复和摘要长度边界 |
| 测试工具 | 提取内存版 Browser Storage，统一 Node 测试中的 `window/localStorage` 环境 |

### 验证
- `npm test`：5 个测试文件、30 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。

### 范围说明
- 当前启发式 Compressor 会把用户问题提取为 `fact`，这是路线图中已记录的记忆质量缺陷；本 Sprint 没有用测试固化该行为，留待 MemoryCandidate 阶段修正。
- Next.js 16.2.9 的既有安全升级任务仍待独立处理。

---

## Sprint 0.2 — 内部消息角色与 Prompt 分层

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `web/lib/ai/messages.ts`
- `web/lib/agent/promptBuilder.ts`
- `web/lib/ai/chatService.ts`
- `web/lib/config.ts`
- **新建** `web/tests/promptBuilder.test.ts`
- **新建** `web/tests/chatService.test.ts`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 消息边界 | 持久化 `ChatMessage` 只允许 `user/assistant`，系统指令与上下文不进入会话历史 |
| Prompt 类型 | 新增带 `kind/source/role` 的 `PromptMessage`，区分 Persona、Memory 与 Conversation |
| 正确角色 | Persona 从伪造的 `assistant` 历史改为 `system` instruction；Memory 改为独立 context |
| 记忆防注入提示 | Memory 以 JSON 参考数据进入 Prompt，并明确声明可能过期且不得视为指令 |
| Provider 边界 | 请求前投影为标准 `{ role, content }`，内部 `kind/source` 不发送给第三方接口 |
| 历史兼容 | 原 `ChatMessage` 从 `config.ts` 重新导出，现有 Session/localStorage 结构无需迁移 |

### 验证
- `npm test`：4 个测试文件、8 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。

---

## Sprint 0.1 — Session 持久化一致性

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/config.ts`
- `web/lib/runtime/backend.ts`
- `web/app/chat/page.tsx`
- `web/app/api-key/page.tsx`
- `web/package.json`
- `web/package-lock.json`
- **新建** `web/vitest.config.ts`
- **新建** `web/tests/config.test.ts`
- **新建** `web/tests/backend.test.ts`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 空 Session 持久化 | `[]` 现在是合法事实状态；删除最后会话后不会被旧消息重新迁移 |
| 单一写入者 | Browser Backend 统一负责运行期 Session 创建、更新、删除和 localStorage 快照写入 |
| 外部 Store 订阅 | Chat 使用 `useSyncExternalStore` 读取稳定快照，UI 不再通过 Effect 二次持久化 |
| 删除安全 | 删除会话会中止所属运行任务，迟到的异步回复不能复活已删除会话 |
| React 规则清理 | API 配置页改为 hydration 后初始化表单，清除原有同步 Effect setState 错误 |
| 测试基线 | 引入兼容 Node 20 的 Vitest 3.2.6，覆盖空数组、旧数据迁移、完整快照和异步复活回归 |

### 验证
- `npm test`：2 个测试文件、5 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。
- `npm audit --omit=dev`：仍报告 Next.js 16.2.9 及其生产依赖的 4 个高危公告；修复建议涉及升级到 16.3.4，应作为独立依赖维护 Sprint 验证，不在本次状态修复中使用 `--force`。

---

## Planning 1.1 — 插件体系、Android 与自托管路线修订

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/REFERENCE_PROJECT_STUDY.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 产品范围 | 将可扩展学习活动、Android APK 和笔记本自托管纳入明确方向，仍排除近期公开插件市场 |
| 插件模型 | 定义 Skill、Tool、Activity、Connector，以及 Manifest、Installation、StudyRecord 与持久事件 |
| 安全边界 | 增加 Capability Gateway、结构化调用、隔离存储、配额、审计、撤销和 UI 沙箱 |
| 首批插件 | 将背书与解题设计为两个第一方插件，验证 Plugin API 后再允许外部安装 |
| 移动端 | 确立 Web-first + PWA + Capacitor APK，共享领域代码并使用平台 Adapter |
| 自托管 | 设计笔记本 Docker Compose 运行环境、离线补偿、备份恢复和未来云迁移约束 |
| 路线图 | 新增 Phase 6 插件验证与移动交付，作品集化顺延为 Phase 7，并补充 ADR-016 至 ADR-022 |

---

## Research 1.0 — 爱语与相关开源项目架构学习

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `docs/REFERENCE_PROJECT_STUDY.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 爱语结构学习 | 基于静态分析任务，归纳对话、主动消息、记忆、外部接入、语音/形象、模块和成本可观测性 |
| 开源项目对照 | 分析 DeepSeek Harness、Codex、Trigger.dev、Warashi、YuriOS、Letta、Mem0、Open-LLM-VTuber 等项目 |
| 架构修订 | 增加 Act/Interrupt 双门控、Durable Inbox、记忆检索阶梯、结构化工具权限和表达层 Adapter |
| 技术验证 | 设计 Scheduler、记忆检索、主动性、安全红队和语音延迟五类实验 |
| 学习路线 | 制定 30/60/90 天实施顺序、源码阅读路径与作品集表达方式 |

---

## Planning 1.0 — 产品与技术总规划

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 产品定位 | 明确专业知识工作、学习成长、主动任务与克制型情感陪伴的统一定位 |
| 当前基线 | 盘点已有 Chat、Browser Runtime、Memory、Prompt 与 Planner，并记录原型限制 |
| 参考架构 | 分析 ChatGPT Scheduled Tasks、DeepSeek Harness、OpenAI Codex 与同类产品的可借鉴边界 |
| 总体架构 | 设计 Next.js 模块化单体、PostgreSQL、Scheduler、Worker、Agent Runtime 与通知系统 |
| 技术规范 | 定义 Conversation、Message、Task、TaskRun、Memory、Content、Notification 与事件格式 |
| 功能设计 | 详述专业回答、思考问题、新闻、书籍、人格、主动联系、记忆与 PWA 通知 |
| 工程规范 | 增加 API、权限、安全、可观测性、测试、Agent Evals 和 Definition of Done |
| 路线图 | 给出 Phase 0–6 的短期 Sprint、6/12 个月目标、长期愿景与作品集 Demo |

---

## Phase 9.2 — Browser Backend Layer

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Backend 执行引擎 | `backend.ts`：通用异步任务队列，`runTask(id, fn)` + `subscribe/notify`，零领域知识 |
| 领域 Action 分离 | `chatService.ts`：`executeSend` 和 `executeRetry` 独立函数，不共享 mode 参数 |
| UI 订阅模式 | `page.tsx`：删除 `useRef`/`currentRequestRef`/callback，改为 `subscribe(backend)` 同步状态 |
| 职责分离 | Backend=执行引擎，chatService=API+领域Action，UI=订阅+dispatch |
| 删除 Runtime 混合代码 | `activeRequests` Map、`executeBackgroundRequest`、`RequestMode` 全部删除 |

### 架构
```
UI (React) → subscribe/notify → Backend (runTask) → chatService (executeSend/Retry) → localStorage
  ↑ 订阅 + dispatch              ↑ 通用执行引擎               ↑ 领域 Action（独立函数）
```

---

## Sprint 9 — Chat Runtime Model + Background Execution

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/config.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Runtime Layer | `executeBackgroundRequest(requestId, messages, sessionId, mode, onComplete)` 模块级单例，后台执行 AI 请求并直接写 localStorage |
| request registry | `activeRequests: Map<string, boolean>` 全局管理请求生命周期 |
| 后台执行 | UI 不再 `await sendChatMessage`，改为 fire-and-forget + callback 同步 |
| 版本系统 | `ChatMessage.versions?: string[]` + `activeVersion?: number` |
| 统一模型 | assistant 永远只有一条，Send 追加新 assistant，Retry 只更新 versions |
| 版本切换 UI | ◀ 版本 N/M ▶ 按钮，切换显示不同版本内容 |
| Retry 增强 | 每条 assistant 消息可独立 retry，confirm 确认 |

### 架构升级
```
旧: UI await sendChatMessage() → setSessions
新: UI → executeBackgroundRequest(mode) → Runtime → chatService → localStorage → 回调同步 UI
```

---

---

## Phase 9.3 — 执行隔离 + Abort + Session 级 loading

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Abort 支持 | `runTask(id, sessionId, fn)` → fn 接收 `AbortSignal`，传入 `fetch(url, { signal })` |
| 停止生成按钮 | loading 时 "发送" 变为红色 "停止生成"，调 `abortTask(id)` |
| aborted vs error | `TaskStatus` 新增 `"aborted"`，`AbortError` 单独处理，不显示错误 |
| Session 级 loading | `getTasksBySession(sessionId)` 替代全局 `getAllTasks()`，不串台 |
| API/LocalStorage 分离 | `sendChatMessage(messages, signal)` + `applySendReply` / `applyRetryReply` |

---

## Phase 9.4 — 状态一致性收敛（Event Log 架构）

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Event Log 架构 | `BackendEvent = task_update \| session_update`，`emit(event)` 替代 `notify()` |
| sessionStore | Backend 拥有 `Map<string, Session>` 缓存，`saveSessions` 仅 backend 调用 |
| signal.aborted 守卫 | `runTask.then/catch` 中 `if (signal.aborted) return`，真正终止控制流 |
| chatService 纯函数 | `applySendReply/Retry(session, reply)` 只算不写，入参变为 Session |
| UI 事件消费 | `subscribe(event)` → 增量 merge：`session_update` 更新 sessions，`task_update` 更新 tasks |
| loading 事件驱动 | `Object.values(tasks).some(t => t.status === "running" && sessionId)` |
| 消除三份真相源 | backend 单写 → 事件单向流动 → React state 只读 |

### 架构
```
Backend (唯一写入者)
  ├─ taskStore
  ├─ sessionStore
  └─ emit(event) → UI subscribe → 增量 merge
       ↑ 事件单向流动，无漂移
```

---

## Phase 10 — Browser Agent Core System

**Commit**: `803470b`（Phase 0 汇总提交）

### 新建文件
- `web/lib/agent/memory.ts` — 长期记忆系统（`agent_memory_store`）
- `web/lib/agent/contextCompressor.ts` — 上下文压缩（阈值 20 条消息）
- `web/lib/agent/promptBuilder.ts` — 唯一 prompt 构造器（SSOT）
- `web/lib/agent/taskPlanner.ts` — 任务规划器（关键词匹配）
- `web/lib/agent/dispatcher.ts` — Domain hook 注册（idempotent）

### 修改文件
- `web/lib/runtime/backend.ts` — `taskType` + 按类型分类的 `registerTaskCompleteHook`
- `web/app/chat/page.tsx` — `buildAgentPrompt` + `initAgentDispatcher`

### 变更内容
| 功能 | 说明 |
|------|------|
| Memory System | `addMemory/getMemory/clearMemory`，localStorage 持久化，自动去重 |
| Context Compressor | 超过 20 条消息自动压缩为首 3+尾 5+用户事实 |
| Prompt Builder | 显式参数 `{ session, memory, persona? }`，输出 `[system, memory_ctx, ...messages]` |
| Task Planner | 关键词匹配（总结/分析/计划/比较）→ 步骤列表 |
| Hook Registry | `registerTaskCompleteHook(taskType, fn)` 按类型分类，domain pipeline |
| UI 纯渲染 | subscribe 只做 setSessions/setTasks，零 domain logic |

### Agent 数据流
```
sendMessage → buildAgentPrompt(session, getMemory())
  → sendChatMessage(agentContext)
  → backend.runTask.then
    → emit + taskCompleteHook("chat_completion")
      → compress(session) → addMemory()
```

---

## Sprint 8 — Chat State Reliability Layer

**Commit**: `39157b2 step7`

### 修改文件
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| requestId 追踪 | 新增 `useRef<string \| null>`，每次请求生成 `crypto.randomUUID()` |
| 卸载安全 | `useEffect` cleanup 将 `currentRequestRef.current = null`，stale 响应跳过 setState |
| sendMessage 防护 | try/catch/finally 中校验 requestId，stale 时跳过 |
| Retry 保留旧结果 | 旧 assistant 消息不再删除，新回复追加到 `[...s.messages, newAssistant]` |
| Retry 确认 | `window.confirm("确定要重新生成回复吗？")` |
| Delete 确认 | `window.confirm("确定要删除这个对话吗？")` |

---

## Sprint 7.5 — Chat UX Incremental Upgrade

**Commit**: `39157b2 step7`

### 修改文件
- `web/lib/config.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| 删除 Session | 侧栏每项 hover 显示 ✕ 按钮，immutable filter 删除 |
| Retry 重新生成 | 最后一条 assistant 旁 "重新生成" 按钮，复用 loading/error state |
| 消息时间戳 | `ChatMessage.createdAt?: number`，UI 显示 HH:MM |
| 换行支持 | `whitespace-pre-wrap` CSS，保留 `\n` 换行 |
| 气泡间距 | `space-y-6` 加大消息间距 |

---

## Sprint 7 — AI Service Layer

**Commit**: `39157b2 step7`

### 修改文件
- **新建** `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| chatService.ts | `sendChatMessage(messages): Promise<string>` 纯函数，零 React 依赖 |
| UI 解耦 | `page.tsx` 删除所有 `fetch` 直接调用，改为 `sendChatMessage(updatedMessages)` |
| 导入清理 | 删除 `getApiKey/getApiBaseUrl/getApiModel`，UI 不再直接读配置 |

**架构分层**:
```
UI Layer (page.tsx) → Service Layer (chatService.ts) → Config Layer (config.ts)
```

---

## Sprint 6 — Chat Session System

**Commit**: `a073631 step6`

### 修改文件
- `web/lib/config.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Session 数据结构 | `Session = { id, title, messages, updatedAt }` |
| localStorage | `agent_chat_sessions` 数组替代单 `agent_chat_messages` |
| 左侧 Session 列表 | `w-64` 侧栏，新建/切换/高亮 |
| 数据迁移 | `migrateOnce()` 自动将旧 `agent_chat_messages` 转为 "历史对话" session |
| 状态强约束 | 仅 `sessions` + `activeSessionId` 两个 state，messages 为派生值 |
| 不可变更新 | 所有更新通过 `setSessions(prev => prev.map(...))` |

---

## Sprint 5 — 多轮对话 + 持久化

**Commit**: `0df7b1b step 5`

### 修改文件
- `web/lib/config.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| 完整上下文 | API 请求从单条消息改为发送完整 `messages` 历史 |
| localStorage 持久化 | 新增 `getChatMessages()` / `saveChatMessages()` |
| 消息去重 | `updatedMessages = [...messages, userMessage]` 一次性构建，state 与 API 同源 |
| 空状态升级 | "开始你的第一段对话" + "输入问题，AI 将为你提供帮助" |

---

## Sprint 4 — UX 闭环 + 双向导航

**Commit**: `fff1847 step4 patch1`

### 修改文件
- `web/app/chat/page.tsx`
- `web/app/api-key/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Chat 错误引导 | 未配置时显示完整提示 + "前往配置" 按钮（Link） |
| API Key 返回入口 | header 右侧 "返回对话" 链接 |
| 双向导航闭环 | `Chat ⇄ API Key` 形成完整 UX 闭环 |

---

## Sprint 3 — AI API 集成

**Commit**: `fff1847 step4 patch1` / `b984602 step4`

### 修改文件
- `web/lib/config.ts`
- `web/app/api-key/page.tsx`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| API Key 三合一配置 | API Key + Base URL + Model 三类字段管理 |
| localStorage config | `agent_api_key` / `agent_api_base_url` / `agent_api_model` |
| Chat 真实 API 调用 | `fetch` → OpenAI-compatible `/chat/completions` |
| Loading 状态 | "AI 思考中..." + 禁用输入/按钮 |
| Error 处理 | 配置缺失 / 网络失败 / 非 200 响应 |
| API 配置入口 | Chat header 右侧 "API 配置" 链接 |

---

## Sprint 2.5 — UI 结构重构

**Commit**: `64cca8d step3`

### 修改文件
- `web/app/page.tsx`

### 变更内容
- 删除三个功能卡片（情感助手/学习助手/自带 API Key）
- 删除 Footer
- "开始对话" 按钮改为 `<Link href="/chat">` 跳转
- Landing Page 精简为纯产品入口

---

## Sprint 2 — Chat UI (Mock)

**Commit**: `64cca8d step3` / `e43621c step2`

### 修改文件
- **新建** `web/app/chat/page.tsx`
- `web/app/api-key/page.tsx`

### 变更内容
- Chat 页面：消息列表 + 输入框 + 发送按钮
- Mock AI 回复："（模拟回复）我正在等待接入 AI 模型..."
- API Key 页面基础实现（输入/保存/删除）

---

## Sprint 1 — 项目初始化

**Commit**: `22c63f8 step 1` / `e43621c step2`

### 修改文件
- `web/app/page.tsx`
- `web/app/layout.tsx`

### 变更内容
- Landing Page v1：标题 AI Study Companion + 副标题 + Start Chat 按钮 + 三列功能卡片 + Footer
- 全站中文化：UI 文案改为中文优先，metadata 中文化
- Tailwind CSS v4 响应式布局

---

## Day 1-2 — 项目搭建

**Commit**: `0f7641e Day 2` / `5f30f4e Day 1`

- `create-next-app` 脚手架
- 配置 TypeScript + Tailwind CSS v4 + App Router
- 初始化 CLAUDE.md / PROJECT.md / README.md

---

## 当前项目结构

```
web/
├── app/
│   ├── layout.tsx          # 根布局，metadata 中文
│   ├── page.tsx            # Landing Page（产品入口）
│   ├── api-key/
│   │   └── page.tsx        # API 三合一配置页
│   └── chat/
│       └── page.tsx        # 多 Session 聊天系统
├── lib/
│   ├── config.ts           # localStorage 配置 + Session 数据层
│   └── ai/
│       └── chatService.ts  # AI API 调用抽象层
├── components/             # (预留)
└── hooks/                  # (预留)
```

## localStorage 键值

| Key | 类型 | 用途 |
|-----|------|------|
| `agent_api_key` | string | API Key |
| `agent_api_base_url` | string | API Base URL |
| `agent_api_model` | string | Model 名称 |
| `agent_chat_sessions` | Session[] | 多会话数据（已替代旧 `agent_chat_messages`） |
