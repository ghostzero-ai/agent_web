# ADR-034：Provider-aware Push 与 HarmonyOS 适配端口

- 状态：Accepted（客户端落地顺序由 ADR-036 扩展）
- 日期：2026-09-13

## 背景

现有通知链路只实现标准 Web Push。HarmonyOS 5 手机可以访问网页，但浏览器是否开放 Push API 取决于系统 Web 内核与厂商策略；华为官方 Web Push 文档列出的目标浏览器是 PC Chrome、Firefox 和 Edge，不能把 HarmonyOS 浏览器视为已支持设备。

华为 Push Kit 的 HarmonyOS 流程是：原生应用取得 Push Token 并上报业务服务端，服务端再调用华为 Push 服务。HarmonyOS 5.x 对应 V3 `messages:send` 接口。因此这不是替换一个 Web Push URL，而是新增一种设备凭据和服务端认证协议。

## 决策

1. `push_subscriptions.provider` 记录投递协议；旧数据自动取默认值 `web-push`。
2. Notification Worker 只负责安静时段、投递状态和重试编排，通过 `PushProviderRegistry` 按 provider 分发，不再依赖 VAPID 或 Web Push 数据格式。
3. 现有 Web Push 的订阅解密、VAPID 和 HTTP 错误映射封装进 `WebPushProvider`。
4. 预留 `huawei-push` 标识、原生 Token/服务端配置契约和 HarmonyOS 5 V3 endpoint 构造器；本阶段不伪造华为发送实现。
5. 未安装的 provider 明确返回 `PUSH_PROVIDER_UNAVAILABLE`，不回退到其他协议，避免把设备 Token 发给错误厂商。
6. 客户端分两阶段落地：先由 Capacitor Android APK 在卓易通环境验证 HMS Push Token、后台接收和点击深链，再由 ArkTS + ArkWeb HAP 实现原生 Adapter；网页的 Web Push 注册接口继续保持严格输入格式。
7. 华为服务账号私钥必须像 VAPID 私钥一样在服务端加密，project ID、app ID、key ID 等非秘密元数据可以明文保存；Token 按发送凭据处理并加密。
8. APK 本地到期提醒与 Huawei Push 是两条不同通道：前者可在任务同步后离线触发，后者负责服务端生成的主动聊天、新闻和书籍结果。

## 取舍

- 当前 HarmonyOS 网页仍可能无法收到系统推送；本次交付的是可扩展服务端边界，不是假装完成真机适配。
- Android APK/Capacitor 适配不等同于 HarmonyOS NEXT 原生适配。卓易通只作为近期兼容路径，HMS SDK 能否完整取得 Token、在后台收取通知以及正确处理深链必须以目标手机实测为准。
- 后期 HAP 继续共享 React UI、API Client 与领域模型，但由 ArkTS + ArkWeb 实现系统通知、文件、语音和深链桥接。
- 暂不创建华为密钥表、Token 注册 API 或引入 Huawei SDK，避免在没有 AppGallery Connect 项目、包名和服务账号的阶段制造无效配置与额外依赖。

## 后续接入条件

1. 创建 AppGallery Connect/Huawei Developer 项目和 Android 应用，配置签名指纹并启用 Push Kit。
2. 在 Capacitor Android 工程中加入预编译 HMS Push 插件，申请权限、取得 Token，并在卓易通真机验证 Token 生命周期。
3. 增加受认证的 `huawei-push` 订阅登记/删除接口与服务端凭据表。
4. 实现服务端认证缓存和 Huawei Provider，注册进现有 Registry，不修改 Notification Worker。
5. 用目标手机验证前台、后台、进程终止、重启、Token 轮换、权限拒绝与点击深链。
6. 当兼容路径不足或进入正式 HarmonyOS 交付时，新建 ArkTS + ArkWeb HAP，以相同 API 契约替换客户端 Adapter。

## 依据

- [Huawei Push Kit 简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/push-kit-introduction)
- [Huawei Push Kit JWT 与 V3 接口](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/push-jwt-token)
- [HarmonyOS 通知授权](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/notification-enable-V5)
- [Huawei Web Push 开发流程](https://developer.huawei.com/consumer/pt/doc/HMSCore-Guides/web-dev-progress-0000001080676256)
