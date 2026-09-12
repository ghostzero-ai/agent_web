# Sprint 2.4 总结报告：Web Push 与安静时段

- 完成日期：2026-09-12
- 状态：工程实现完成；剩余 1 项用户真机授权验收
- 下一 Sprint：2.5 Agent Prompt Task

## 1. 目标与结果

Sprint 2.4 的目标，是在 Sprint 2.3 Durable Inbox 之上增加用户可控的系统通知，同时不把 Push 当成可靠事实源。现已形成以下闭环：

```text
Task 到期
  → 独立 Worker 创建唯一 TaskRun / InboxItem
  → PostgreSQL 为当时已订阅的设备规划唯一 Delivery
  → 安静时段检查
  → Web Push Service
  → 浏览器 Service Worker 显示通用通知
  → 点击进入对应 InboxItem
```

即使 Push 权限被拒绝、设备订阅失效或操作系统没有展示通知，提醒仍保留在 `/inbox`。网页关闭不影响 Worker；笔记本关机、休眠、Docker 停止或断网期间无法即时发送，恢复后会继续处理持久队列。

## 2. 已完成能力

### 服务端与数据库

- 新增稳定 VAPID 配置、通知偏好、加密设备订阅、持久投递记录与 Inbox 规划标记。
- VAPID 首次使用时自动生成，之后从 PostgreSQL 读取，容器重建不会无故轮换。
- PushSubscription 和 VAPID 私钥用 AES-256-GCM 加密；两类密文采用不同 AAD。
- endpoint 只保存 SHA-256 去重值与加密正文，不通过读取 API 或日志返回。
- 为每个 InboxItem/设备建立唯一 Delivery，使用 `FOR UPDATE SKIP LOCKED`、租约和 attempt fencing 支持多 Worker 安全竞争与崩溃恢复。
- 408、429、5xx 和网络错误从 5 分钟开始指数退避，最多尝试 5 次；404/410 自动注销设备并取消它的剩余投递。
- 新设备不接收订阅之前的历史 InboxItem，防止首次启用通知轰炸。

### 用户体验

- `/notifications` 提供系统通知总开关、安静时段和设备列表。
- 只在用户点击“在此设备启用”后请求权限，不在页面加载时打扰。
- 默认安静时段为北京时间 22:00–08:00；发送前再次检查，避免排队期间偏好变化导致误发。
- 可单独移除设备；全局暂停不会删除订阅或 Inbox。
- manifest 以 standalone 模式启动到 `/inbox`；Service Worker 接收 Push，并在点击通知后聚焦/打开对应 InboxItem。
- iOS/iPadOS 页面明确说明：16.4+、添加到主屏幕、从主屏幕应用内授权。

### 隐私与安全

- 锁屏载荷只含通用标题、通用正文和 InboxItem ID，不发送任务标题、正文、prompt、endpoint 或密钥。
- Push API 严格校验 HTTPS endpoint、base64url key、UUID、时间和未知字段。
- 通知偏好使用 expectedVersion 乐观锁，降低多设备静默覆盖风险。
- Worker 显式接收 `CREDENTIAL_MASTER_KEY`，日志只记录事件、Delivery ID、错误码与计数。
- 生产依赖审计为 0 漏洞。
- 应用当前没有登录鉴权，仍只允许 localhost 或可信 Tailscale Tailnet；不可启用 Funnel 或公网端口转发。

## 3. 主要工程文件

| 层 | 文件/目录 | 职责 |
|---|---|---|
| Schema | `web/lib/db/schema.ts`, `web/drizzle/0005_faithful_mystique.sql` | Push 配置、偏好、订阅、投递及迁移 |
| 加密 | `web/lib/notifications/pushSecretCipher.ts` | Subscription/VAPID 私钥用途隔离加密 |
| 配置 | `web/lib/notifications/pushConfigurationService.ts` | VAPID 生命周期与脱敏公开状态 |
| API | `web/lib/api/pushApi.ts`, `web/app/api/v1/push/` | 订阅、设备、偏好接口 |
| 投递 | `web/lib/repositories/notificationDeliveryRepository.ts` | 规划、claim、租约、重试与终态 |
| Worker | `web/lib/notifications/notificationWorker.ts`, `web/scripts/reminder-worker.ts` | Push 发送与常驻循环 |
| 浏览器 | `web/lib/api/pushClient.ts`, `web/public/sw.js` | 权限、PushManager、Service Worker |
| UI/PWA | `web/components/notifications/NotificationSettings.tsx`, `web/app/notifications/`, `web/app/manifest.ts` | 通知设置与安装体验 |
| 运维 | `docker-compose.yml`, `.env.selfhost.example`, `docs/WEB_PUSH.md` | 容器密钥、启用与排障 |

## 4. 验证结果

| 检查 | 结果 |
|---|---|
| 全量 Vitest | 42 个文件、155 项通过 |
| Microsoft Edge E2E | 8 项通过，含 390×844 移动端通知设置 |
| TypeScript | `npx tsc --noEmit` 通过 |
| ESLint | `npm run lint` 通过 |
| Drizzle | `npm run db:check` 通过；迁移/回滚/重应用集成测试通过 |
| 本机生产构建 | `npm run build` 通过 |
| Docker 生产构建 | Web/Worker 镜像构建通过 |
| 实际容器 | PostgreSQL 与 Web healthy，Worker 常驻且迁移为最新 |
| 实时 API | health=healthy；VAPID 公钥长度 87；响应无私钥/密文 |
| PWA | manifest=standalone，start_url=/inbox，Service Worker 可访问 |
| 生产依赖审计 | 0 vulnerabilities |

完整开发依赖审计仍报告 Vitest/@vitest/mocker 2 个 moderate。修复要求强制升级到 Vitest 5，属于测试工具的破坏性升级，不进入生产镜像运行路径；本 Sprint 不使用 `npm audit fix --force`，后续应单独升级并跑全量回归。

## 5. 审查中发现并修复的问题

1. 跨午夜安静时段边界和退避上限补齐了单元测试；指数退避现在确实能达到 6 小时上限。
2. 增加订阅创建时间护栏，避免新设备收到历史 Inbox 全量补推。
3. 把 Push Service 错误和数据库落账错误分离，避免发送成功后的数据库异常被误标成网络故障。
4. Docker Worker 显式注入主密钥，防止 Web 能解密而 Worker 不能投递。
5. 锁屏负载改为通用文案，并用测试断言私人标题/正文不出现在 payload。

## 6. 尚存边界与人工验收

自动化无法代替浏览器的真实用户手势授权。目前实时数据库显示 `pushEnabled=false`、0 台订阅设备、0 条 Delivery，因此没有向真实手机 Push Service 发送测试消息，也没有伪造“真机已通过”。

用户只需完成一次：

1. 手机开启 Tailscale，打开项目 HTTPS 地址的 `/notifications`。
2. Android 可直接点击“在此设备启用”；iPhone/iPad 先添加到主屏幕，再从主屏幕应用打开并点击启用。
3. 打开系统通知总开关并保存。
4. 在 `/tasks` 创建 2–3 分钟后到期的一次性提醒，然后关闭网页。
5. 确认收到通用系统通知，点击后进入 `/inbox` 对应提醒。

若失败，按 `docs/WEB_PUSH.md` 检查权限、安静时段、Worker、Tailscale、系统省电/专注模式和订阅状态。

## 7. 提交记录

- `7eb39a1`：Web Push 依赖
- `370d626`：Push 数据模型与迁移
- `2e5b4f4`：加密订阅服务与 API
- `dc26b36`：PWA、Service Worker 与通知设置 UI
- `1a46e3b`：后台持久投递 Worker
- `4b979b1`：投递错误语义审查修复
- `156d29c`：使用手册、ADR 与路线图封版

每个功能提交之后均有独立 CHANGELOG 提交并已推送到 `origin/main`。

## 8. 下一步建议

先完成上述真机人工验收并保留结果。随后进入 Sprint 2.5：为 Task 增加 Agent Prompt 类型、执行阶段与模型调用续租，把生成内容持久写入 Inbox；Push 继续作为同一 Delivery 层消费 Inbox，无需为 AI 任务另造通知通道。
