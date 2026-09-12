# ADR-034：Provider-aware Push 与 HarmonyOS 适配端口

- 状态：Accepted
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
6. 将来由 HarmonyOS 原生壳（HAP）取得用户通知授权与 Push Token，通过独立受认证接口登记；网页的 Web Push 注册接口继续保持严格输入格式。
7. 华为服务账号私钥必须像 VAPID 私钥一样在服务端加密，project ID、app ID、key ID 等非秘密元数据可以明文保存；Token 按发送凭据处理并加密。

## 取舍

- 当前 HarmonyOS 网页仍可能无法收到系统推送；本次交付的是可扩展服务端边界，不是假装完成真机适配。
- HarmonyOS 5 原生应用通常是 HAP 工程，不应把 Android APK/Capacitor 适配等同于 HarmonyOS NEXT 适配。共享 React UI、API Client 与领域模型仍可复用，但系统通知桥接需要独立实现和真机验证。
- 暂不创建华为密钥表、Token 注册 API 或引入 Huawei SDK，避免在没有 AppGallery Connect 项目、包名和服务账号的阶段制造无效配置与额外依赖。

## 后续接入条件

1. 创建 AppGallery Connect/Huawei Developer 项目和 HarmonyOS 应用，启用 Push Kit。
2. 新建最小 HarmonyOS 原生壳，申请通知权限、取得 Push Token，并验证 Token 刷新生命周期。
3. 增加受认证的 `huawei-push` 订阅登记/删除接口与服务端凭据表。
4. 实现 JWT 鉴权和 V3 `https://push-api.cloud.huawei.com/v3/{projectId}/messages:send` Provider。
5. 用 HarmonyOS 5 真机验证前台、后台、进程终止、重启、Token 轮换、权限拒绝与点击深链。

## 依据

- [Huawei Push Kit 简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/push-kit-introduction)
- [Huawei Push Kit JWT 与 V3 接口](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/push-jwt-token)
- [HarmonyOS 通知授权](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/notification-enable-V5)
- [Huawei Web Push 开发流程](https://developer.huawei.com/consumer/pt/doc/HMSCore-Guides/web-dev-progress-0000001080676256)
