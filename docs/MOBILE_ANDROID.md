# Android Debug APK 开发与安装

- 当前阶段：Mobile M0.3 首轮兼容验证已完成，M0.4 本地通知真机验收待执行
- 构建类型：仅 Debug APK，不是可发布签名版本
- 应用 ID：`com.ghostzero.aistudycompanion`

## 当前架构

当前 APK 是有明确期限的 Capacitor remote-shell Spike：APK 内包含 Capacitor Bridge 与离线兜底页，Debug 构建时注入 Tailscale HTTPS 地址并加载现有 Next.js 应用。模型密钥、数据库和 Scheduler 仍只存在服务端。

Capacitor 官方把 `server.url` 定位为 Live Reload，而非生产部署。本 APK 用于个人安装、卓易通兼容和平台插件验证；进入正式 APK 前必须完成 M1.1 本地 Web Bundle。

## 已安装工具

| 工具 | 当前值 |
|---|---|
| Android Studio | `2026.1`，`E:\development\Android\Android_Studio` |
| Android SDK | `E:\development\Android\sdk` |
| Compile/Target SDK | 36 |
| Minimum SDK | 24 |
| Gradle | 8.14.3 |
| 构建 JDK | Microsoft OpenJDK 21 LTS，`E:\development\Java\microsoft-jdk-21\jdk-21.0.12.1+1` |
| Capacitor | 8.5.2 |

Android Studio 2026.1 自带 JDK 25，但当前 Gradle 8.14.3 不能运行 Java 25 class file，因此项目构建显式使用 JDK 21。不要为了本项目覆盖系统 Java 8；构建脚本只在自己的进程内设置 `JAVA_HOME`。

## 一键重建 Debug APK

先确认 Docker Desktop、项目 Compose 服务和 Tailscale 正在运行，然后在仓库根目录执行：

```powershell
.\scripts\mobile-build-debug.ps1 `
  -ServerUrl "https://<你的设备名>.<你的-tailnet>.ts.net/chat"
```

脚本会：

1. 检查 JDK 与 Android SDK。
2. 临时设置 `CAPACITOR_BUILD_PROFILE=spike` 与 HTTPS Server URL。
3. 同步 Capacitor 插件和配置。
4. 生成 Debug APK 与 SHA-256。
5. 构建结束后把仓库内生成配置恢复为不含个人地址的离线状态。

APK 输出：

```text
web/android/app/build/outputs/apk/debug/app-debug.apk
```

APK 被 Android 工程的 `.gitignore` 排除，不提交到 GitHub。每次重新生成后应重新核对哈希。

## 安装到手机

### 文件安装

1. 把 `app-debug.apk` 传到手机。
2. 允许文件管理器/卓易通安装未知来源应用。
3. 安装 `AI Study Companion`。
4. 手机登录同一 Tailscale Tailnet，并确认电脑节点在线。
5. 电脑启动 Docker Desktop 和项目 Compose 服务后再打开 APK。

### USB ADB 安装

手机开启开发者选项和 USB 调试，连接电脑并确认授权，然后执行：

```powershell
E:\development\Android\sdk\platform-tools\adb.exe devices -l
E:\development\Android\sdk\platform-tools\adb.exe install -r `
  "D:\Visual Studio Code\project\agent_web\web\android\app\build\outputs\apk\debug\app-debug.apk"
```

当前检查时没有连接 ADB 设备，因此尚未自动安装或完成真机启动测试。

## 每次电脑重启

需要运行：

1. Docker Desktop。
2. 项目 Compose 服务：`docker compose --env-file .env.selfhost up -d`。
3. Tailscale，保持登录和 Serve 配置有效。

手机端需要 Tailscale/卓易通环境可用。服务端健康检查地址：

```text
https://<你的设备名>.<你的-tailnet>.ts.net/api/v1/health
```

## M0.3 真机验收矩阵

首轮华为手机/卓易通结果：登录、Chat SSE 流式输出、数学公式和树形分支通过；网页 Web Push 未弹窗。文件导出、音频和 HMS Push 尚未进入实现验收，不计为通过。

## M0.4 本地通知验收矩阵

- `/tasks` 使用循环式时/分双滚轮选择时间，触摸惯性滚动后自动吸附，支持跨越 `23/00` 和 `59/00` 边界。
- 在 APK 内点击“开启本地提醒”，系统权限状态显示为已开启。
- 创建 3–5 分钟后到期的一次性任务；前台、后台、锁屏各验证一次。
- 点击通知后打开 `/tasks` 并滚动到对应任务。
- 修改任务时间后旧提醒不再触发；暂停、删除任务后系统待处理提醒被撤销。
- 每天、每周规则在系统层保持重复；手机重启后待处理提醒仍存在。
- 拒绝权限时应用不把任务保存误报为失败，并给出系统设置指引。
- 未授予精确闹钟权限时记录 Capacitor 的降级警告；提醒允许回退为非精确调度。

### 快速诊断（无需等待一天）

在 APK 的 `/notifications` 展开“通知诊断”，每轮点击“10 秒通知测试”，依次验证：

1. 保持应用前台；
2. 切到后台但保留最近任务；
3. 从最近任务列表划掉应用；
4. 使用华为系统清理。

安排后应先看到“测试状态：待发送”，弹出后不要点击或清除通知，手动重新打开应用并刷新，应看到“已送达”。Android 的已送达列表只包含仍留在通知栏中的通知，点击或划掉后会恢复为“无记录”。要验证取消路径，安排测试后立即点击“取消测试”，等待 10 秒确认没有弹出。任务本身的暂停/删除可创建 2–3 分钟后到期的一次性任务后立即暂停或删除，无需等到每日任务的次日时间。

当前 HarmonyOS 5 / 卓易通实测为前台、后台成功，系统清理后失败。如果仅第 4 组失败，说明系统清理很可能将兼容层应用置于类似 Android 强行停止的状态；下一步应验证系统自启动/后台运行白名单，并评估 Huawei Push 或 ArkTS 代理提醒，而不是增加耗电且不可靠的常驻保活服务。

本地通知只提醒已同步的任务时间。AI 主动聊天、每日新闻、书籍推荐等服务端新内容仍需要 Huawei Push Kit。

## 安全边界

- APK 内不包含模型 API Key、数据库连接、Credential Master Key 或 Huawei 服务端凭据。
- Debug APK 使用 Android Debug 证书，只用于个人测试，不可发布应用商店。
- remote-shell 只允许 HTTPS 且必须显式使用 `spike` 构建配置。
- Tailscale URL 不是认证 Token，但不提交到生成的 Android 配置中；源配置只保留环境变量入口。
- 未来离开 Tailscale 或支持多人前，必须先增加设备认证、Token 撤销与严格 Origin/CORS 策略。
