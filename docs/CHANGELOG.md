# CHANGELOG

本文档记录 AI Study Companion 项目所有 Sprint 的变更历史。

---

## Provider 稳定性 — 临时 DNS 故障重试

**Commit**: `7b9f63b`

### 为什么

Docker 中的 DeepSeek 配置、Key 和模型均有效，但一次 `getaddrinfo EAI_AGAIN` 会在建立上游请求前立即终止 SSE。短暂 DNS 抖动不应直接表现为模型不可用。

### 怎么做

- 仅识别 Node.js `fetch` 的 `EAI_AGAIN` 临时 DNS 错误。
- 首次失败后以 100ms、300ms 退避，最多执行 3 次 DNS 建连尝试。
- 用户取消会立即终止等待；认证、限流、模型不存在及其他 HTTP 响应完全不重试。
- 安全日志只记录固定错误码和尝试次数，不记录 Key、消息、URL 或上游正文。

### 修改文件

- `web/lib/ai/server/modelProvider.ts`
- `web/tests/modelProvider.test.ts`
- `docs/CHANGELOG.md`

### 验证方法与结果

- 容器内实际调用 DeepSeek `/chat/completions` 返回 HTTP 200，确认现有 Base URL、Key 与模型名可用。
- 新增“首次 EAI_AGAIN、第二次成功”的流式响应测试，并验证仅执行一次安全告警。
- `npm test`：23 个测试文件、93 个测试全部通过。
- `npm run build`、`npm run lint`、`npx tsc --noEmit`、`git diff --check`：通过。

## Credential Vault 3/3 — 前端设置页与 Docker 集成

**Commit**: `57d229c`

### 为什么

数据层与服务端 API 完成后，仍需要一个用户可操作但不可回读明文的配置入口，并确保 Docker 自托管环境具备独立的凭据主密钥。该任务完成从网页测试、加密保存到模型运行时使用的闭环。

### 怎么做

- 将 `/api-key` 从只读环境状态页改为写入式凭据设置页，支持测试、保存、替换和删除。
- 表单明文只保留在 React 组件状态和当次请求内，保存成功后清空；页面只展示末四位提示。
- 增加类型化前端 Client、状态反馈、危险删除确认和旧 localStorage 凭据清理。
- Docker Compose 强制要求 `CREDENTIAL_MASTER_KEY`，模型 `AI_*` 变量改为可选兜底。
- 自托管示例加入主密钥占位，且真实 `.env.selfhost` 继续由 Git 忽略。

### 修改文件

- `.env.selfhost.example`
- `docker-compose.yml`
- `web/.env.example`
- `web/app/api-key/page.tsx`
- `web/components/config/ModelCredentialSettings.tsx`
- `web/e2e/credential.spec.ts`
- `web/lib/api/modelCredentialClient.ts`
- `web/tests/modelCredentialClient.test.ts`
- `web/tests/modelCredentialSettings.test.tsx`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 凭据设置页 | 填写 Base URL、Model、Key；测试不落库，保存后清空 Key 输入 |
| 公开状态 | 只显示配置来源、Provider、模型、Base URL、版本与 Key 末四位 |
| 删除与回退 | 删除存储凭据后，若服务器存在完整 `AI_*` 则回退环境变量 |
| Docker 主密钥 | 容器启动时强制注入 `CREDENTIAL_MASTER_KEY`，不烘焙进镜像 |
| 防泄露验证 | 真容器写入一次性假 Key 后，数据库仅出现 AES-GCM 信封且不含明文 |

### 验证方法与结果

- `npm test`：23 个测试文件、92 个测试全部通过。
- `npm run test:e2e`（Microsoft Edge）：4 个端到端测试全部通过，其中包括凭据测试、保存和删除闭环。
- `npm run build`、`npm run lint`、`npx tsc --noEmit`、`npm run db:check`、`git diff --check`：通过。
- Docker Desktop 实机构建、迁移 `0002_goofy_smasher.sql`、双容器健康检查和 API/数据库集成检查通过；一次性假凭据已在验证后删除。

### localStorage 变化

- 不新增 Key；旧 `agent_api_key`、`agent_api_base_url`、`agent_api_model` 会被清理。

## Credential Vault 2/3 — 安全凭据 API 与模型运行时

**Commit**: `ac006c0`

### 为什么

加密表本身不能形成产品能力；浏览器需要一个严格、不可回读明文的服务端接口，聊天、健康检查和未来 Scheduler 也必须统一从同一个解析边界取得模型配置，避免再次依赖前端逐请求携带 Key。

### 怎么做

- 新增凭据状态、保存、删除和 Provider `/models` 连接测试接口。
- 严格校验 JSON、字段数量、长度、HTTPS URL，并拒绝 URL 内嵌账号密码。
- Provider 测试限制 10 秒，只返回连接与模型可用性，不转发上游响应正文。
- 模型流与健康检查异步解析数据库凭据；没有存储记录时兼容回退服务端环境变量。
- 状态、错误与日志均不返回 API Key、加密信封、数据库细节或上游正文。

### 修改文件

- `web/app/api/v1/model/config/route.ts`
- `web/app/api/v1/model/credentials/route.ts`
- `web/app/api/v1/model/credentials/test/route.ts`
- `web/lib/ai/server/modelConfig.ts`
- `web/lib/ai/server/modelCredentialService.ts`
- `web/lib/api/healthApi.ts`
- `web/lib/api/modelApi.ts`
- `web/lib/api/modelCredentialApi.ts`
- `web/tests/healthApi.test.ts`
- `web/tests/modelApi.test.ts`
- `web/tests/modelCredentialApi.test.ts`
- `web/tests/modelCredentialService.test.ts`
- `web/tests/modelProvider.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| `GET /api/v1/model/credentials` | 返回来源、Provider、Base URL、Model、Key 末四位提示和版本 |
| `PUT /api/v1/model/credentials` | 接收一次明文输入，在服务端加密并只返回公开状态 |
| `DELETE /api/v1/model/credentials` | 删除数据库凭据；环境变量兜底不受影响 |
| `POST /api/v1/model/credentials/test` | 用临时输入查询 Provider 模型列表，不写数据库 |
| 运行时解析 | 存储凭据优先、环境变量兜底；后台任务可复用同一入口 |
| 故障隔离 | 凭据存储异常时健康检查返回安全 503，配置接口返回稳定错误结构 |

### 验证方法与结果

- `npm test`：21 个测试文件、89 个测试全部通过。
- API 测试覆盖未知字段、HTTP/内嵌认证 URL、主密钥缺失和响应不泄密。
- Service 测试覆盖加密保存、服务端解密、模型列表检测和上游认证错误映射。
- `npm run lint`、`npx tsc --noEmit`、`npm run build`、`git diff --check`：通过。

### localStorage 变化

- 无；明文 Key 只存在于设置请求和短暂服务端内存中。

## Credential Vault 1/3 — 加密凭据数据层

**Commit**: `42aabd7`

### 为什么

模型配置此前只能从服务端环境变量读取，未实现项目原始的 BYOK 设置流程；直接恢复浏览器 localStorage 又会重新引入 XSS、跨设备和后台任务无法取 Key 的问题。本任务先建立只在服务端解密的持久化地基。

### 怎么做

- 新增单用户、按 Provider 唯一的 `model_credentials` 表及可回滚迁移。
- API Key 使用 AES-256-GCM、随机 96-bit IV、128-bit Auth Tag 和固定 AAD 加密，密文采用带版本信封格式。
- 数据库只保存密文、末四位提示、加密主密钥版本与乐观版本，不保存明文。
- Repository 提供读取、原位 upsert 与删除，并始终约束固定本地用户和 `openai-compatible` Provider。

### 修改文件

- `web/drizzle/0002_goofy_smasher.sql`
- `web/drizzle/meta/0002_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/drizzle/rollback/0002_goofy_smasher.sql`
- `web/lib/ai/server/credentialCipher.ts`
- `web/lib/db/schema.ts`
- `web/lib/repositories/modelCredentialRepository.ts`
- `web/tests/credentialCipher.test.ts`
- `web/tests/databaseMigrations.test.ts`
- `web/tests/modelCredentialRepository.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 加密信封 | `v1.iv.authTag.ciphertext`，认证加密可拒绝篡改或错误主密钥 |
| Schema | 用户/Provider 唯一、级联删除、正数版本约束和完整时间戳 |
| Repository | 单用户凭据读取、替换和删除；更新不产生重复行 |
| 回滚 | 最新迁移可独立删除 `model_credentials` 并重新应用 |

### 验证方法与结果

- `npm test`：19 个测试文件、80 个测试全部通过。
- 加密测试：明文不进入信封、正确解密、篡改拒绝、非法主密钥拒绝。
- Repository 测试：唯一记录 upsert、版本递增、删除幂等、存储值无测试明文。
- `npm run db:check`、`npm run lint`、`npx tsc --noEmit`、`npm run build`：通过。

### localStorage 变化

- 无；API Key 不恢复到浏览器存储。

## Sprint 1.5.1 — Docker 迁移入口兼容修复

**Commit**: `c91a58d`

### 为什么

首次真实 Docker Desktop 演练发现，生产镜像中的 `tsx` 将迁移入口按 CommonJS 输出处理，原有顶层 `await` 无法转换，导致 Web 容器在数据库健康后循环重启。此前静态 Compose 检查、PGlite 迁移测试与宿主机构建均未覆盖这一容器运行时差异。

### 怎么做

- 将迁移与回滚入口收进显式异步 `main()`，避免依赖顶层 `await`。
- 在入口末尾统一捕获错误并设置失败退出码，同时继续通过 `finally` 关闭数据库连接。
- 增加自托管制品回归断言，防止迁移入口重新引入 CommonJS 不兼容写法。

### 修改文件

- `web/scripts/db-migrate.ts`
- `web/scripts/db-rollback.ts`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 容器启动 | PostgreSQL 健康后可执行全部迁移并启动 Next.js，不再循环重启 |
| 回滚入口 | 与迁移入口保持相同的 CommonJS 兼容生命周期和失败退出语义 |
| 回归保护 | 静态检查两个命令入口均使用 `main()` 和显式错误捕获 |

### 验证方法与结果

- `npm test`：17 个测试文件、76 个测试全部通过。
- `npm run lint`、`npx tsc --noEmit`：通过。
- `npm run build`：受限网络首次因 Google Fonts 获取失败；在允许网络后通过。
- `docker compose --env-file .env.selfhost up --build -d`：真实 Docker Desktop 构建并启动成功。
- PostgreSQL 容器 `healthy`；Web 容器 `healthy`，仅映射 `127.0.0.1:3000`。
- 容器日志确认应用 `0000_easy_joystick.sql`、`0001_perfect_typhoid_mary.sql` 后启动 Next.js。
- `/api/v1/health` 返回 `degraded`：数据库 `ready`，模型凭据按计划尚未配置。

### localStorage 变化

- 无。

## Sprint 1.5 — Docker Compose 单用户自托管基线

**Commit**: `c42bbdc`

### 为什么

开发服务器与独立 localStorage 无法让笔记本稳定承担个人服务端，也不能形成可重复的云迁移、健康检查和备份恢复流程。本 Sprint 把 Web/API 与 PostgreSQL 组合为默认安全的单机部署单元。

### 怎么做

- Compose 编排 Next.js 与 PostgreSQL；数据库只在内部网络提供服务并使用命名卷。
- Web 默认绑定 localhost，等待数据库健康，入口脚本先执行版本化迁移再启动生产服务。
- 新增不泄密的 readiness 健康端点，区分 healthy、degraded 与 unhealthy。
- 提供 PowerShell/POSIX `pg_dump` 备份与显式确认恢复脚本，恢复期间停止 Web 写入。
- 真实环境文件和备份被 Git/Docker build context 排除，Shell 文件固定 LF。

### 修改文件

- `.env.selfhost.example`
- `.gitattributes`
- `.gitignore`
- `PROJECT.md`
- `README.md`
- `docker-compose.yml`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/PHASE_1_COMPLETION_REPORT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SELF_HOSTING.md`
- `docs/SERVER_DATA_API.md`
- `docs/adr/ADR-028-COMPOSE-SELF-HOSTING-BASELINE.md`
- `scripts/selfhost-backup.ps1`
- `scripts/selfhost-backup.sh`
- `scripts/selfhost-restore.ps1`
- `scripts/selfhost-restore.sh`
- `web/.dockerignore`
- `web/.gitignore`
- `web/Dockerfile`
- `web/app/api/v1/health/route.ts`
- `web/docker-entrypoint.sh`
- `web/lib/api/healthApi.ts`
- `web/tests/healthApi.test.ts`
- `web/tests/selfHostingArtifacts.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| Compose 拓扑 | Web/PostgreSQL 健康依赖、重启策略和持久卷；数据库无宿主机端口 |
| 安全默认 | Web 默认 `127.0.0.1`，密钥由未提交环境注入，容器启用 no-new-privileges |
| 启动迁移 | 数据库 ready 后先运行 `db:migrate`，失败时不启动不兼容应用 |
| 健康检查 | 数据库决定 readiness；模型缺失为 degraded；错误与 Secret 不进入响应 |
| 备份 | Windows 与 POSIX 脚本生成带时间戳的 plain SQL dump |
| 恢复 | 文件存在/非空校验、显式确认、停止 Web、重建 Schema、SQL 失败即停、成功后重启 |
| 云迁移 | 同一容器、环境变量和 Schema 可迁移，公网鉴权/TLS 仍明确在范围外 |

### 验证方法与结果

- `npm test -- --run`：17 个测试文件、75 个测试全部通过。
- 自托管专项测试：验证数据库无端口、持久卷、localhost 默认、健康依赖、迁移顺序、Secret 排除和恢复确认。
- `npx tsc --noEmit --pretty false`、`npm run lint`、`npm run build`：通过。
- `npm run db:check` 与 `npm run db:generate`：通过且无未生成 Schema 变化。
- Compose 由 PyYAML 成功解析为 `postgres`、`web` 两个服务。
- 两份 PowerShell 脚本由 PowerShell AST Parser 成功解析。
- `npm prune --offline --ignore-scripts`：审计 542 个包，0 项已知漏洞。
- 当前机器没有 Docker；WSL/Bash 启动被系统拒绝，因此容器启动、重启恢复、真实 `pg_dump/psql` 与 POSIX 语法仍需在有 Docker 的环境补做实机演练，不能记为通过。

### localStorage 变化

- 本 Sprint 无新增 localStorage 键值变化；服务端事实源沿用 Sprint 1.4 结果。

### 项目结构快照

```text
agent_web/
├── docker-compose.yml              # Web + private PostgreSQL
├── .env.selfhost.example           # 无效示例配置
├── scripts/                        # 跨平台备份/恢复
├── docs/                           # API、迁移、自托管、ADR 与完成报告
└── web/
    ├── app/api/v1/                 # conversations/imports/model/health
    ├── app/chat/                   # PostgreSQL 事实源 Chat UI
    ├── drizzle/                    # 两条 forward/rollback 迁移
    ├── lib/api/                    # 服务端 API 与浏览器 API Clients
    ├── lib/repositories/           # Conversation 与 Legacy Import 边界
    ├── tests/                      # 17 个单元/组件/数据库/部署测试文件
    ├── Dockerfile
    └── docker-entrypoint.sh
```

### 下一步

- Phase 2 Sprint 2.1：建立 Task/TaskRun Schema 与 CRUD UI；在公开网络或多人使用前先完成鉴权。

---

## Sprint 1.4 — 显式旧数据导入与服务端 Chat 事实源

**Commit**: `46231b7`

### 为什么

Sprint 1.2 的数据库与浏览器 localStorage 并行存在，无法跨设备读取同一会话；自动上传旧历史又会违反用户确认原则。本 Sprint 提供安全迁移并结束双事实源状态。

### 怎么做

- Chat 改用 Conversation API 完成读取、创建、删除、消息追加、自动标题与分支切换。
- 浏览器旧会话只用于迁移提示，用户确认前不上传、不删除。
- 导入 API 严格校验树、角色、数量与文本上限，为旧 ID 生成 UUID 映射。
- 新增 `conversation_imports` 收据和唯一约束，重复导入直接跳过。
- 每个会话、消息树、活动叶与收据在同一事务提交；失败保留 localStorage 源。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/LEGACY_DATA_IMPORT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SERVER_DATA_API.md`
- `docs/adr/ADR-027-EXPLICIT-LEGACY-DATA-IMPORT.md`
- `web/app/api/v1/conversations/[id]/route.ts`
- `web/app/api/v1/imports/local-storage/route.ts`
- `web/app/chat/page.tsx`
- `web/drizzle/0001_perfect_typhoid_mary.sql`
- `web/drizzle/meta/0001_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/drizzle/rollback/0001_perfect_typhoid_mary.sql`
- `web/e2e/chat.spec.ts`
- `web/lib/api/conversationApi.ts`
- `web/lib/api/conversationClient.ts`
- `web/lib/api/legacyImportApi.ts`
- `web/lib/api/legacyImportClient.ts`
- `web/lib/db/schema.ts`
- `web/lib/repositories/conversationRepository.ts`
- `web/lib/repositories/legacyImportRepository.ts`
- `web/tests/conversationApi.test.ts`
- `web/tests/conversationClient.test.ts`
- `web/tests/databaseMigrations.test.ts`
- `web/tests/legacyImport.test.ts`
- `web/tests/legacyImportClient.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 服务端 Chat | PostgreSQL 成为会话事实源，浏览器刷新后重新读取完整消息树 |
| 标题持久化 | 首条问题通过带 `expectedVersion` 的 PATCH 保存，避免刷新退回默认标题 |
| 显式迁移 | preview 展示可导入/已导入数量，确认按钮才触发服务端写入 |
| 树保真 | 新 UUID 映射保留父子节点、兄弟回答和活动叶路径 |
| 输入安全 | 拒绝未知字段、重复 ID、缺失父节点、自引用、环路、非法叶和特权消息角色 |
| 幂等收据 | `(user_id, source, source_id)` 唯一，重复请求不复制会话 |
| 失败恢复 | 只有服务端成功后删除 `agent_chat_sessions`，失败可安全重试 |
| 浏览器回归 | HTTP 模拟服务端证明 UI 不再依赖 localStorage 运行时写入 |

### 验证方法与结果

- Sprint 1.4 封版时：15 个测试文件、69 个测试全部通过。
- PGlite 集成覆盖两条真实迁移、树保真、活动分支、重复导入、preview 与非法输入拒绝。
- Conversation API 覆盖标题更新与过期版本冲突；浏览器 Clients 覆盖映射、请求体和失败保留本地源。
- Microsoft Edge E2E 3/3 通过：服务端会话刷新、早期回答分支、显式导入后 KaTeX 渲染。
- TypeScript、Lint、生产构建、Drizzle check/generate 均通过。
- 本 Sprint 未改变依赖锁；沿用 Sprint 1.3 对同一 lockfile 的 0 漏洞结果，并在最终审计再次得到 0。

### localStorage 变化

- `agent_chat_sessions` 不再接收运行时会话写入，只在检测到旧数据时作为待确认迁移源。
- 用户选择“暂不导入”时保留原值；服务端确认导入成功后删除该键。
- 历史模型配置键仍按 Sprint 1.3 规则清除。

### 下一步

- Sprint 1.5：用 Docker Compose 提供可重启、可检查、可备份恢复的笔记本自托管基线。

---

## Sprint 1.3 — 服务端 Model Provider 与 SSE Streaming

**Commit**: `563097e`

### 为什么

此前浏览器直接保存并携带模型 API Key，请求路径既会暴露密钥，也难以统一处理 Provider 差异、流式取消和安全错误。Sprint 1.3 将模型访问收口到 Next.js 服务端，为后续自托管、移动端和多 Provider 扩展建立稳定边界。

### 怎么做

- 用服务端环境变量读取 API Key、Base URL 和模型名，浏览器只能读取脱敏后的配置状态。
- 新增 OpenAI-compatible Provider Adapter，在服务端发起请求并解析 SSE 或 JSON fallback。
- 新增内部 `/api/v1/model/stream` SSE 接口，统一 `meta`、`delta`、`done`、`error` 事件。
- 将浏览器取消信号传播到上游 Provider，并为流式增量使用稳定 assistant 消息 ID，避免重复消息节点。
- 清除历史浏览器模型配置键，配置页改为只读服务端状态页。
- 对输入规模、URL 协议、Provider 状态码和外部错误信息建立显式安全边界。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SERVER_DATA_API.md`
- `docs/SERVER_MODEL_PROVIDER.md`
- `docs/adr/ADR-026-SERVER-MODEL-STREAMING.md`
- `web/.env.example`
- `web/app/api-key/page.tsx`
- `web/app/api/v1/model/config/route.ts`
- `web/app/api/v1/model/stream/route.ts`
- `web/app/chat/page.tsx`
- `web/components/config/LegacyApiConfigCleanup.tsx`
- `web/e2e/chat.spec.ts`
- `web/lib/ai/chatService.ts`
- `web/lib/ai/server/modelConfig.ts`
- `web/lib/ai/server/modelProvider.ts`
- `web/lib/api/modelApi.ts`
- `web/lib/config.ts`
- `web/tests/chatService.test.ts`
- `web/tests/config.test.ts`
- `web/tests/modelApi.test.ts`
- `web/tests/modelProvider.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 服务端密钥 | `AI_API_KEY` 只在 Node.js Runtime 中读取，不进入客户端 bundle、请求体或 localStorage |
| Provider Adapter | 兼容 OpenAI Chat Completions，隔离鉴权、URL、模型和上游响应解析 |
| 内部 SSE | 浏览器仅访问同源接口，以稳定事件协议接收增量文本、完成和安全错误 |
| 取消传播 | 客户端中止读取时，服务端 AbortController 会取消上游请求 |
| 流式 UI | 同一 assistant 节点持续更新，完成后保持相同 ID 和树关系 |
| 错误契约 | 鉴权、限流、模型不存在、请求拒绝、不可用、非法响应使用稳定错误码 |
| 配置安全 | Base URL 默认要求 HTTPS；状态接口只返回 Origin、模型名和缺失字段 |
| 旧配置清理 | Chat 和配置页挂载时移除浏览器中遗留的三个模型配置键 |

### 验证方法与结果

- `npm test -- --run`：12 个测试文件、58 个测试全部通过。
- Provider/API 测试：覆盖密钥不出服务端、HTTP 显式开关、跨 chunk SSE、EOF 尾帧、JSON fallback、限流映射、严格输入校验和取消传播。
- `npx tsc --noEmit --pretty false`：通过。
- `npm run lint`：通过。
- `npm run db:check`：迁移元数据一致。
- `npm run db:generate`：无未生成 Schema 变化；本 Sprint 无数据库迁移。
- `npm run build`：通过；模型配置与流式接口均为 Node.js 动态路由。
- Playwright：3 条 Microsoft Edge 主链路断言全部通过；Windows 下 Next 开发服务在断言完成后保留句柄，测试协调进程由人工结束，因此没有把该次进程退出码记为成功。
- `npm audit --audit-level=high`：0 项已知漏洞。

### localStorage 变化

- 启动时删除 `agent_api_key`、`agent_api_base_url`、`agent_api_model`。
- `agent_chat_sessions` 的结构和读写方式暂时不变；其显式导入将在 Sprint 1.4 完成。

### 下一步

- Sprint 1.4：实现用户确认的 localStorage 会话树导入、幂等去重，并让 Chat UI 使用服务端 Conversation API 作为事实来源。

---

## Sprint 1.2 — Conversation/Message Repository 与 API

**Commit**: `9e522d0`

### 为什么

Sprint 1.1 只有 PostgreSQL Schema 与迁移，Route、未来 Worker 和模型 Runtime 仍缺少统一的数据访问边界。本 Sprint 建立单用户服务端事实数据入口，并把对话树归属、活动叶节点和并发版本规则集中到 Repository，避免各层直接拼接 SQL。

### 怎么做

- 用固定 UUID 建立幂等的本地用户，不允许 API 接收或伪造 `userId`。
- 使用 Drizzle Repository 提供会话创建、列表、详情、删除、消息追加和活动分支切换。
- 消息追加在一个事务中完成 Conversation 行锁、父节点归属校验、Message 写入、active leaf 推进和版本递增。
- 活动分支切换验证同会话、真实叶节点与 `expectedVersion`，拒绝静默并发覆盖。
- Next.js Node.js Route Handler 提供 `/api/v1`，Zod 负责严格输入校验，统一错误结构、Request ID 和 `no-store`。
- 保持现有 Chat/localStorage 不变；旧数据导入仍由 Sprint 1.4 显式处理。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SERVER_DATA_API.md`
- `docs/adr/ADR-025-CONVERSATION-REPOSITORY-AND-API.md`
- `web/app/api/v1/conversations/route.ts`
- `web/app/api/v1/conversations/[id]/route.ts`
- `web/app/api/v1/conversations/[id]/messages/route.ts`
- `web/app/api/v1/conversations/[id]/active-leaf/route.ts`
- `web/lib/api/conversationApi.ts`
- `web/lib/db/client.ts`
- `web/lib/repositories/conversationRepository.ts`
- `web/package-lock.json`
- `web/package.json`
- `web/tests/conversationApi.test.ts`
- `web/tests/conversationRepository.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 数据库客户端 | 延迟读取 `DATABASE_URL`，复用 Postgres.js 连接池，避免构建阶段连接数据库和开发热更新重复建池 |
| 本地用户 | 固定 UUID + `ON CONFLICT DO NOTHING`，重复请求只保留一个单用户身份锚点 |
| Conversation Repository | 提供列表、创建、完整树详情和级联删除，所有查询限定本地用户 |
| Message 事务 | 校验父节点存在且属于同一会话；消息和活动叶/版本更新共同成功或共同回滚 |
| 分支一致性 | 只允许选择同会话且无子节点的真实叶；非空会话不能清空 active leaf |
| 并发控制 | Conversation 使用行锁和 `version` 乐观锁，过期客户端收到 `VERSION_CONFLICT` |
| HTTP API | 新增 4 个动态路由，覆盖 6 个 Conversation/Message 操作 |
| 输入校验 | 新增并固定 `zod@4.5.4`，严格验证 UUID、枚举、长度、URL 和未知字段 |
| 错误契约 | `{ error: { code, message, retryable, requestId, details? } }`；数据库内部错误不返回客户端 |
| 安全文档 | 明确当前无登录鉴权，只能在本机或可信私有网络使用，不得直接暴露公网 |
| 架构记录 | ADR-025 固化 Repository 边界、固定单用户、树事务、乐观锁和分阶段迁移策略 |

### 验证方法与结果

- `npm test`：10 个测试文件、53 个测试全部通过。
- Repository 集成测试：覆盖跨实例读取、树形兄弟分支、父节点归属、失败回滚、乐观锁、叶节点约束和级联删除。
- API 集成测试：覆盖创建/列表/详情/删除、消息追加、输入错误、版本冲突、Request ID 和数据库初始化失败的安全响应。
- `npm run db:check`：迁移元数据一致。
- `npm run db:generate`：没有未生成的 Schema 变化；本 Sprint 无新增数据库迁移。
- `npx tsc --noEmit --pretty false`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；新增 4 个 Node.js 动态 API 路由，原 4 个静态页面正常生成。
- Playwright：3 个 Microsoft Edge 既有主链路断言全部通过；受限网络下 Google Fonts 使用 fallback。Windows 本机复用的 Next 开发服务器在断言结束后仍保持句柄，本次手动结束测试协调进程，未终止不属于本次任务的既有 Node 进程。
- `npm audit`：0 项已知漏洞。

### localStorage 变化

- 键名和值结构均无变化。
- Chat UI 仍使用 `agent_chat_sessions`；数据库 API 与浏览器数据暂时并行，避免未经确认上传旧会话。

### 项目结构快照

```text
web/
├── app/
│   ├── api/v1/conversations/       # 会话、消息与活动分支 Route Handlers
│   ├── api-key/                     # 浏览器 API 配置页
│   └── chat/                        # 当前 localStorage Chat UI
├── components/chat/                 # Chat 展示与安全 Markdown 渲染
├── drizzle/                         # forward/rollback SQL 与快照
├── lib/
│   ├── agent/                       # Prompt、Memory 与 Dispatcher
│   ├── ai/                          # 当前浏览器 Provider 适配
│   ├── api/                         # HTTP 校验、响应与错误契约
│   ├── conversation/                # 浏览器树形领域操作
│   ├── db/                          # Schema、连接与迁移基础
│   ├── repositories/                # 服务端领域持久化边界
│   └── runtime/                     # Browser Backend
├── scripts/                         # 数据库 migrate/rollback 命令
└── tests/                           # 单元、组件、数据库与 API 集成测试
```

### 下一步

- Sprint 1.3：把 Model Provider 和 API Key 移到服务端，实现可取消的 SSE Streaming，并复用本 Sprint Repository 保存 user/assistant 消息。

---

## Sprint 1.1 — PostgreSQL + Drizzle + Migration 基线

**Commit**: `96649c8`

### 为什么

Phase 0 的 localStorage 只能支持单浏览器原型，无法作为跨设备会话、可靠定时任务、后台 Worker 与未来云端迁移的事实来源。本 Sprint 先建立可审阅、可升级、可回滚的数据地基，不提前接入 Repository/API 或改动现有 Chat 行为。

### 怎么做

- 以 PostgreSQL 为服务端事实数据库，以 Drizzle TypeScript Schema 为结构源，以版本化 SQL 为部署制品。
- 使用显式配对的 forward/rollback SQL；自定义 Runner 提供事务、迁移历史、排他锁、幂等执行和 SHA-256 漂移检测。
- 使用 PGlite 执行仓库中的真实 PostgreSQL SQL，覆盖当前机器没有 PostgreSQL/Docker 时的自动化迁移回归。
- `active_leaf_message_id` 保留为列但暂不建立循环外键；Sprint 1.2 Repository 必须验证活动叶节点属于同一 Conversation。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/adr/ADR-024-POSTGRES-DRIZZLE-MIGRATIONS.md`
- `web/.env.example`
- `web/.gitignore`
- `web/drizzle.config.ts`
- `web/drizzle/0000_easy_joystick.sql`
- `web/drizzle/meta/0000_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/drizzle/rollback/0000_easy_joystick.sql`
- `web/lib/db/migrations.ts`
- `web/lib/db/postgresMigrationDatabase.ts`
- `web/lib/db/schema.ts`
- `web/package-lock.json`
- `web/package.json`
- `web/scripts/db-migrate.ts`
- `web/scripts/db-rollback.ts`
- `web/tests/databaseMigrations.test.ts`

### 变更内容

| 功能 | 说明 |
|------|------|
| 最小数据模型 | 新增 `users`、`conversations`、`messages`，使用 UUID、`timestamptz`、Enum、JSONB、外键、索引和乐观锁版本列 |
| 树形持久化 | `messages.parent_message_id` 使用自引用外键，`conversations.active_leaf_message_id` 保存当前分支位置 |
| Drizzle 基线 | 新增 Drizzle 配置、Schema、生成 SQL、快照与 `db:generate` / `db:check` 命令 |
| 事务化升级 | `db:migrate` 按序应用待执行迁移，同一事务写入 `app_internal.schema_migrations`，重复执行幂等 |
| 显式回滚 | rollback SQL 单独存放，`db:rollback` 每次事务化回滚最新一条迁移，避免 down SQL 被前向工具误执行 |
| 漂移与并发保护 | 已应用 SQL 使用 SHA-256 校验；历史表排他锁避免两个进程重复迁移 |
| 配置安全 | 提交无效凭据的 `.env.example`，继续忽略 `.env.local` 等真实环境文件 |
| 依赖安全 | 新增 Drizzle/Postgres/PGlite/tsx；覆盖 Drizzle Kit 的旧 esbuild 传递依赖后，完整与生产审计均为 0 |
| 操作文档 | 新增环境准备、生成、升级、回滚、事务、安全和后续迁移规范；ADR-024 固化架构取舍 |

### 验证

- `npm test`：8 个测试文件、46 个测试全部通过。
- 数据库集成测试：真实执行首次建库、默认值写入、重复升级、单步回滚、回滚后重建与迁移漂移拒绝。
- `npm run db:check`：Drizzle migration 元数据一致。
- `npm run db:generate`：Schema 无未生成变更。
- `npx tsc --noEmit --pretty false`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。
- `npm run test:e2e`：3 个 Microsoft Edge 主链路全部通过；网络受限时 Google Fonts 使用既有 fallback，不影响用例。
- `npm audit` 与 `npm audit --omit=dev`：均为 0 项已知漏洞。
- 当前机器未安装 PostgreSQL、Docker 或 `psql`，因此未连接外部数据库；迁移 SQL 由进程内 PostgreSQL 兼容引擎验证。标准 Docker 环境仍按路线图在 Sprint 1.5 引入。

### localStorage 变化

- 键名和值结构均无变化。
- Chat UI 仍由 `agent_chat_sessions` 提供数据；Sprint 1.2 接入 Repository/API，Sprint 1.4 再提供无重复导入。

### 下一步

- Sprint 1.2：实现单用户身份引导、Conversation/Message Repository、事务化活动分支更新和服务端 API。

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
