# PROJECT.md

PROJECT_NAME:

AI Study Companion

==================================================

PROJECT_TYPE:

Personal AI Agent Web Application

==================================================

GOAL:

构建一个支持用户自定义API Key的AI陪伴与学习网站。

重点：

长期维护

持续迭代

软件工程实践

==================================================

CURRENT_PHASE:

Phase 2 — Reliable Task Loop

==================================================

CURRENT_TASK:

Sprint 2.1 — Task/TaskRun Schema and CRUD UI

==================================================

NEXT_TASK:

Sprint 2.2 — Scheduler Claim and Idempotent Runs

==================================================

TARGET_USER:

个人用户

学生

AI学习者

==================================================

CORE_FEATURES:

Landing Page

API Key

Chat

Emotion Agent

Study Agent

==================================================

TECH_STACK:

Framework:

Next.js 16

Language:

TypeScript

UI:

Tailwind CSS

Database:

PostgreSQL + Drizzle ORM

Router:

App Router

Deploy:

Docker Compose self-hosting baseline; Vercel remains optional

==================================================

PROJECT_STRUCTURE:

agent_web/

README.md

CLAUDE.md

PROJECT.md

web/

prompts/

==================================================

ARCHITECTURE_FREEZE:

保持Next.js结构。

保持TypeScript。

保持Tailwind。

保持App Router。

未经确认不得修改。

==================================================

OUT_OF_SCOPE:

登录系统

支付系统

用户中心

多Agent协作

插件系统

==================================================

STORAGE:

PostgreSQL Schema 与迁移基线已经建立。

Conversation/Message Repository 与 `/api/v1` 服务端 API 已建立。

Chat UI 已使用 PostgreSQL Conversation/Message API 作为事实来源，并通过服务端 SSE 调用模型。

历史 `agent_chat_sessions` 只作为待确认导入源；成功导入前保留，成功后清除。

单用户 API Key 从前端写入式设置页提交，由服务端 AES-256-GCM 加密后保存；不进入 localStorage，完整值不通过读取接口返回。环境变量仅作无数据库凭据时的管理员兜底。

默认不保存云端聊天记录。

==================================================

DEVELOPMENT_RULE:

一个任务

↓

一个Commit

↓

保证可运行

↓

继续下一任务

==================================================

SUCCESS:

任何时间：

npm run dev

必须可以正常启动项目。
