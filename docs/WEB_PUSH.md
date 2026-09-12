# Web Push 通知

Sprint 2.4 在 Durable Inbox 之上增加可选的系统级 Web Push。Inbox 仍是提醒事实来源；Push 是可能被系统权限、网络、Push Service、电脑关机或设备策略延迟/丢弃的提示渠道。服务端现已按 Provider 分层，当前可发送的是 `web-push`，并为后续 `huawei-push` 留出稳定端口。

## 1. 启用方式

1. 确认 Docker Compose 的 `postgres`、`web`、`worker` 都在运行。
2. 电脑访问 `http://127.0.0.1:3000/notifications`，或手机通过 Tailscale Serve 的 HTTPS 地址访问 `/notifications`。
3. 点击“在此设备启用”。浏览器只会在这次明确点击后请求通知权限。
4. 保持“系统通知”开启，并按需要设置安静时段。默认是北京时间 22:00–08:00。
5. 在 `/tasks` 创建几分钟后执行的一次性提醒，关闭网页，等待系统通知；点击通知应打开 `/inbox` 中对应提醒。

iPhone/iPad 需要 iOS/iPadOS 16.4 或更新版本，并先用 Safari 将网站“添加到主屏幕”。随后必须从主屏幕图标启动应用，再在 `/notifications` 点击启用。普通 Safari 标签页不能订阅 iOS Web Push。

拒绝权限后，网站不能自行重新弹出授权框；需要在浏览器或系统的网站通知设置中恢复权限。每个浏览器配置文件/主屏幕应用都是独立设备，需要分别启用。

## 2. 数据流

```text
浏览器明确授权
  → Service Worker / PushManager 创建订阅
  → HTTPS API 提交订阅
  → AES-256-GCM 加密后保存 PostgreSQL

Reminder Worker 生成 InboxItem
  → 为当时已订阅的每台设备建立唯一 Delivery
  → 检查北京时间安静时段
  → 使用稳定 VAPID 身份请求浏览器 Push Service
  → Service Worker 显示通用锁屏文案
  → 点击后进入 /inbox?highlight=<InboxItem ID>
```

网页关闭不会影响投递，因为任务执行和 Push 发送都在独立 Worker 中。笔记本关机、休眠、Docker 停止或网络断开时无法发送；恢复后 Worker 会继续处理数据库中的待投递记录。

## 3. 服务端接口

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/push/config` | 读取 VAPID 公钥、偏好与脱敏设备列表 |
| `POST` | `/api/v1/push/subscriptions` | 保存或更新当前浏览器订阅 |
| `DELETE` | `/api/v1/push/subscriptions/:id` | 移除一台设备 |
| `PATCH` | `/api/v1/push/preferences` | 更新总开关与安静时段，使用版本乐观锁 |

读取接口不会返回 VAPID 私钥、Push endpoint、浏览器密钥、加密密文或 `userId`。当前仍是固定单用户且没有应用登录，因此接口只允许 localhost 或可信 Tailscale Tailnet 使用，不可通过 Funnel/端口转发公开。

## 4. 数据与可靠性

- `push_vapid_configurations`：稳定 VAPID 公钥、加密私钥和 Subject。
- `notification_preferences`：总开关、安静时段、时区和并发版本。
- `push_subscriptions`：Provider、endpoint/token hash、加密订阅、设备标签与健康状态；旧记录默认是 `web-push`。
- `notification_deliveries`：InboxItem/设备唯一的持久投递、attempt、租约、重试和错误码。
- `inbox_items.push_planned_at`：区分未规划与已评估但无需 Push 的提醒。

Worker 使用行锁、`SKIP LOCKED`、租约和 attempt fencing，让多个实例不会同时完成同一投递。408、429、5xx 和网络故障使用 5 分钟起的指数退避，最多尝试 5 次；404/410 会把订阅标为失效并取消该设备其余投递。新设备不会补推订阅前的历史 InboxItem。

Worker 不再了解 VAPID 或浏览器订阅结构，而是按订阅的 `provider` 交给 `PushProviderRegistry`。协议细节与错误映射由各 Provider 自己处理；未知 Provider 会以 `PUSH_PROVIDER_UNAVAILABLE` 明确失败，不会错误回退。

Web Push 没有端到端 exactly-once 保证：Push Service 可能接受后仍重复或延迟，操作系统也可能聚合通知。产品事实应始终以 `/inbox` 为准。

## 5. 隐私与密钥

- VAPID 私钥与完整 PushSubscription 使用现有 `CREDENTIAL_MASTER_KEY` 加密；两类密文使用不同 AES-GCM AAD，不能互换。
- Push endpoint 是具备发送能力的秘密 URL，不写日志、不返回读取接口、不以明文入库。
- 锁屏载荷只包含“学习提醒”、通用正文和 InboxItem ID，不包含任务标题、正文或 prompt。
- PostgreSQL 备份包含密文但不包含主密钥。迁移/还原时必须保留原 `CREDENTIAL_MASTER_KEY`，否则旧订阅和 VAPID 身份无法解密，需要重新启用设备。
- `VAPID_SUBJECT` 可在 `.env.selfhost` 中设置为项目 HTTPS URL或 `mailto:` 联系地址；修改它不应轮换已保存的 VAPID 密钥。

## 6. 排障

先执行：

```powershell
docker compose --env-file .env.selfhost ps
docker compose --env-file .env.selfhost logs --tail 100 worker
tailscale serve status
```

检查顺序：

1. `/notifications` 是否显示浏览器支持、权限已允许、设备为 `active`、系统通知总开关已开启。
2. 当前时间是否处于安静时段；安静期内 Inbox 会正常出现，但 Push 延后。
3. `worker` 是否运行，且具有和 `web` 相同的 `CREDENTIAL_MASTER_KEY`。
4. 手机是否开启 Tailscale、系统是否允许该浏览器/PWA 通知、是否启用了省电或专注模式。
5. 若设备显示失效或权限被撤销，移除该设备并重新点击启用。

Worker 日志只记录事件、Delivery ID、错误码和计数，不记录通知正文、endpoint 或密钥。正式真机 Push 无法由自动测试替代，因为浏览器权限必须由用户手势授予；每次发布仍应完成一次上述几分钟后的一次性提醒验证。

## 7. HarmonyOS 5 说明

HarmonyOS 5 能打开本网页，不代表系统浏览器实现了标准 Web Push。当前页面会继续进行能力检测；若“在此设备启用”不可用或无法生成订阅，网页自身不能绕过系统限制。

服务端已经预留 `huawei-push` Provider 契约，但尚未启用真实发送。完整适配需要 HarmonyOS 原生应用取得用户通知授权与 Push Token，上传到本项目服务端，并由服务端用华为服务账号调用 HarmonyOS 5 的 V3 Push API。它还需要 AppGallery Connect 项目、应用标识、服务账号、签名与真机测试，不能仅靠修改网页 JavaScript 完成。详见 [ADR-034](adr/ADR-034-PROVIDER-AWARE-PUSH-AND-HARMONYOS-PORT.md)。

## 8. 实现依据

- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN PushManager.subscribe()](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
- [WebKit：Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13966/web-push-for-web-apps-on-ios-and-ipados/)
- [web-push 官方仓库](https://github.com/web-push-libs/web-push)
- [Huawei Push Kit 简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/push-kit-introduction)
- [Huawei Push Kit JWT 与 V3 接口](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/push-jwt-token)
