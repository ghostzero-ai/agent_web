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

* Conversation/Message 服务端 Repository 与 API

当前 Chat 数据仍保存在浏览器 localStorage；Phase 1 会先接入服务端数据层，再迁移旧数据。

---

## 数据库开发

1. 在 `web/` 下把 `.env.example` 复制为 `.env.local`，填写本机 PostgreSQL 连接串。
2. 执行 `npm run db:migrate` 升级到最新 Schema。
3. 执行 `npm run db:rollback` 事务化回滚最近一条迁移。
4. 修改 `lib/db/schema.ts` 后执行 `npm run db:generate`，审阅生成 SQL，并为新迁移补充同名 rollback SQL。

详细流程、安全约束和故障处理见 `docs/DATABASE_OPERATIONS.md`。

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
