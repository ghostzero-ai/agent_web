# CHANGELOG

本文档记录 AI Study Companion 项目所有 Sprint 的变更历史。

---

## Phase 9.2 — Browser Backend Layer

**Commit**: `(待提交)`

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

**Commit**: `(待提交)`

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
