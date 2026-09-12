# ADR-029：写入式模型凭据保险库

## 状态

Accepted

## 背景

Phase 0 将 API Key、Base URL 和 Model 放在浏览器 localStorage，容易受 XSS 影响，也无法让页面关闭后的 Scheduler/Worker 调用模型。Sprint 1.3 改为服务端环境变量，建立了正确的服务端模型边界，但失去了项目原始的前端 BYOK 设置体验，并要求用户直接编辑部署文件。

## 决策

### 1. 前端只提供写入式凭据交互

- `/api-key` 允许输入、测试、保存和删除 OpenAI-compatible 凭据。
- Key 只在当前输入框状态和保存/测试请求中短暂存在。
- 保存完成立即清空输入；读取接口永不返回明文或密文。
- 浏览器不使用 localStorage、sessionStorage、URL 或 Cookie 保存 Key。

### 2. 服务端认证加密

- Key 使用 AES-256-GCM、随机 96-bit IV、128-bit Auth Tag 与固定 AAD 加密。
- `CREDENTIAL_MASTER_KEY` 是 32 字节无填充 base64url 值，只通过服务端 Secret 注入。
- 数据库保存版本化加密信封、末四位提示和主密钥版本，不保存明文。
- GCM 验证失败、主密钥缺失或格式错误时拒绝使用凭据。

### 3. 单用户存储与运行时解析

- `model_credentials` 当前以固定本地用户和 `openai-compatible` Provider 唯一。
- 模型 Streaming 与健康检查优先读取数据库凭据；不存在时回退 `AI_*` 环境变量。
- 未来 Scheduler/Worker 必须复用同一解析入口，禁止自行读取浏览器数据或复制解密逻辑。

### 4. 连接测试

- 临时测试调用 Provider 的 `/models`，限制 10 秒。
- 只返回连接成功与目标模型是否出现，不返回 Provider 正文。
- 认证失败、限流、网络错误和响应格式错误映射为稳定安全错误。

## 拒绝的方案

### 恢复 localStorage Key

无法支持可靠后台任务、跨设备安全共享和统一服务端策略，拒绝。

### 前端每次聊天都传 Key

扩大密钥暴露面，Scheduler 在没有浏览器请求时仍不可用，拒绝。

### 数据库明文保存

数据库泄漏或备份外泄会直接暴露 Provider 凭据，拒绝。

### 永久只用环境变量

安全但缺少 BYOK 产品交互，个人用户每次换 Key 都要编辑文件并重启，保留为兼容兜底而非首选。

## 后果与边界

- 数据库备份只有密文；恢复时还必须恢复同一 `CREDENTIAL_MASTER_KEY`。
- 主密钥遗失后旧 Key 无法解密，只能删除凭据并重新填写。
- 当前没有应用登录，凭据端点只能用于 localhost 或仅本人设备加入的 Tailscale 私有网络。
- 任意自定义 HTTPS Base URL 仍有 SSRF/DNS 重绑定风险；公开多用户前必须加入认证、Provider/出口白名单和云端 KMS。
- JavaScript 字符串无法保证立即从进程内存清零，但 Key 不进入持久客户端存储、普通响应或日志。

## 2026-09-12 修订

- Provider、Base URL 与 Model 改为用户可输入的非敏感配置，以普通文本列与加密 Key 一起保存在服务端。
- `model_credentials` 从 `userId + 固定 Provider` 唯一改为 `userId` 唯一，表示每个用户一条当前模型配置；修改 Provider 原位更新。
- Provider 当前仅作为厂商标识，连接协议仍为 OpenAI-compatible。未来加入原生 Provider Adapter 时，再让该字段参与适配器选择。
- 迁移若发现旧约束下存在多条 Provider 记录，会保留最近更新项后建立用户唯一索引。
