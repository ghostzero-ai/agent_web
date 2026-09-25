# ADR-037：本地打包移动客户端与受限 CORS

- 状态：Accepted
- 日期：2026-09-25

## 背景

M0 的 Capacitor APK 通过 `server.url` 加载笔记本上的完整 Next.js 页面，适合快速验证卓易通、流式回答、公式、树形对话和原生通知，但它不是正式移动客户端架构。网络中断时整个界面不可用，且 Capacitor 官方把 `server.url` 作为开发期 Live Reload 能力。

项目同时需要继续复用现有 React 页面，不能为了 APK 复制一套聊天、任务、通知和设置业务代码。

## 决策

1. 使用 Vite 为 Capacitor 构建独立的本地 React 入口，产物写入 `web/mobile-dist`，再由 Capacitor 同步进 APK。
2. 正式移动构建的 `webDir` 为 `mobile-dist`，生成配置和 APK 内都不得出现 `server.url`；旧 remote-shell 仅保留在显式 `spike` 配置中。
3. Next.js Web 与 Vite Mobile 复用同一组页面、组件、领域类型和 API Client，不复制业务逻辑。
4. 共享 API Client 在 Web 中使用相对 `/api/v1/*`，在 APK 中使用构建时注入的 Tailscale HTTPS Origin。Origin 不能包含路径、凭据、查询参数或片段。
5. 本地客户端使用 Hash Router，避免 WebView 本地资源路由回源；Web 端仍使用普通 Path Router。
6. Next.js 仅向明确允许的 Capacitor Origin 开放 API CORS，默认值为 `https://localhost`。普通网页同源请求不受影响。
7. APK 断开笔记本服务端时仍应显示本地 UI 和连接诊断，但 Conversation、Task、Inbox 和模型调用仍以服务端/PostgreSQL 为事实源，不伪造离线成功。
8. Web Push 在原生 Capacitor 环境中禁用；已设定任务使用 Local Notifications，未来主动内容使用 Huawei Push。

## 后果

- APK 的界面和原生 Bridge 不再依赖远程网页加载，服务端短暂离线时仍能启动并给出可诊断状态。
- React 页面保持一份实现，但客户端构建现在有 Next.js 与 Vite 两条经过测试的入口。
- Tailscale 地址会作为非秘密 API Origin 编译进个人 Debug APK；模型 Key、数据库连接和服务端密钥仍不会进入 APK。
- 当前 API 没有应用登录鉴权，因此该客户端仍只允许在个人 Tailscale 私网使用。公开网络或多人使用前必须加入设备身份、会话认证、撤销和更严格的授权策略。
- M1.3 仍需在本地 Bundle 上完成真机断网、重启、时区、省电和系统清理回归；M1.1 的自动验证不能替代这些真机测试。
