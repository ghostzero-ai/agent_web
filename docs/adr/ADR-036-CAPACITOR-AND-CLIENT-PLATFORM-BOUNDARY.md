# ADR-036：Capacitor 与客户端平台边界

- 状态：Accepted
- 日期：2026-09-13

## 背景

项目需要 Android APK、卓易通兼容、本地提醒、Prompt 文件导出和语音，同时保留未来 ArkTS + ArkWeb 原生适配。当前 Next.js 工程同时承担浏览器 UI 和服务端 API，不能把 `.next` 直接作为 Capacitor 的离线 Web Bundle。

如果复制一套 Android UI 与业务逻辑，Task、Conversation、Prompt 和权限规则会迅速分叉；如果长期使用 Capacitor `server.url`，又会把官方的 Live Reload 能力误当成生产架构。

## 决策

1. 采用一个共享 React 客户端、一个共享服务端和多个薄平台壳。
2. 平台能力必须通过 `FileExportAdapter`、`SpeechOutputAdapter`、`LocalNotificationAdapter` 和 `NativePushAdapter` 进入，不得散落直接调用 Capacitor 或 ArkTS API。
3. M0 允许 Capacitor Debug APK 使用显式 `spike` 配置，通过 Tailscale HTTPS 加载现有 Next.js 应用；禁止明文 HTTP、URL 凭据和把该配置作为正式发布方案。
4. M1 将可打包客户端入口与 Next.js 服务端边界分开，正式 APK 使用本地 Web Bundle 并调用受认证 API。
5. 普通提醒可同步至设备作冗余本地通知；Task 数据库和 Durable Inbox 仍是事实来源。AI 任务、新闻和主动聊天只能由服务端生成。
6. 先用 Capacitor APK 做卓易通兼容 Spike，再做 ArkTS + ArkWeb HAP；两者复用服务端协议，原生系统能力分别实现。
7. API Key、Huawei 服务端凭据和数据库密钥永不进入 APK。

## 后果

- 近期可较快得到个人 Debug APK，并验证卓易通、WebView、SSE、公式和设备能力。
- 正式离线 Bundle 仍需要一次客户端边界提取，不能把 remote-shell 当成交付完成。
- 原生代码量集中在少数 Adapter 和预编译插件，娱乐模式、插件与核心 Agent 不需要为每个平台重写。
- 未来公开网络访问前必须增加设备认证、严格 CORS/Origin 策略和 Token 撤销，Tailscale 私网本身不替代应用级多用户鉴权。
