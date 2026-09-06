# AI Study Companion

## 项目简介

这是一个支持用户自定义API Key的AI Agent网站。

目标不是快速堆功能，而是完成一个长期维护、结构清晰的软件工程项目。

主要方向：

* 情感陪伴
* 学习辅导
* Prompt实践
* AI Agent开发

---

## 技术栈

Framework

* Next.js 16

Language

* TypeScript

UI

* Tailwind CSS

Deploy

* Vercel

Database

* PostgreSQL
* Drizzle ORM

---

## 当前开发进度

已完成：

* Phase 0 聊天 MVP 基线
* 树形对话与安全 Markdown/数学公式渲染
* PostgreSQL/Drizzle Schema 与可回滚迁移基线

开发中：

* Phase 2：可靠 Task/TaskRun 提醒闭环

Phase 1 已完成：Conversation/Message 服务端 Repository/API、模型 Streaming、显式旧数据导入和 Docker Compose 单用户自托管基线均已建立。Chat 现在以 PostgreSQL 为事实来源；浏览器旧会话只有在用户确认后才会导入，重复请求由导入收据去重。

---

## 数据库开发

1. 在 `web/` 下把 `.env.example` 复制为 `.env.local`，填写本机 PostgreSQL 连接串。
2. 执行 `npm run db:migrate` 升级到最新 Schema。
3. 执行 `npm run db:rollback` 事务化回滚最近一条迁移。
4. 修改 `lib/db/schema.ts` 后执行 `npm run db:generate`，审阅生成 SQL，并为新迁移补充同名 rollback SQL。

详细流程、安全约束和故障处理见 `docs/DATABASE_OPERATIONS.md`。

服务端会话 API 使用 `/api/v1/conversations` 前缀，具体端点、请求格式和并发规则见 `docs/SERVER_DATA_API.md`。当前 API 没有登录鉴权，只能在本机或可信私有网络使用，不得直接暴露到公网。

旧版 `agent_chat_sessions` 的预检、确认、树形迁移、去重和失败恢复规则见 `docs/LEGACY_DATA_IMPORT.md`。

模型配置必须写入 `web/.env.local` 的 `AI_API_KEY`、`AI_BASE_URL` 和 `AI_MODEL`。浏览器不再保存或读取真实 Key；Streaming 与错误码说明见 `docs/SERVER_MODEL_PROVIDER.md`。

笔记本自托管的启动、健康检查、重启恢复、备份还原与局域网安全规则见 `docs/SELF_HOSTING.md`。默认只绑定 localhost，当前无登录鉴权，不可直接暴露公网。

---

## 项目原则

保持简单。

保持稳定。

保持可运行。

每次只完成一个小目标。

---

## 项目目录

agent_web/

├── README.md

├── CLAUDE.md

├── PROJECT.md

├── prompts/

└── web/

---

## 开发流程

规划

↓

编码

↓

验证

↓

Commit

↓

继续下一任务

---

## 长期目标

完成一个可以部署、可以持续迭代、可以扩展为移动端应用的AI Agent网站。
