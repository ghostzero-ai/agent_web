# 第一方插件系统

Phase 7.1 建立最小插件发现与生命周期基础。当前目标是验证边界，不是开放第三方生态。

## 当前数据流

```text
仓库内第一方 Manifest
  → Zod 严格校验
  → Plugin API 版本范围检查
  → Registry 隔离无效或重复项
  → 与 PostgreSQL plugin_installations 合并
  → /api/v1/plugins
  → Web / Capacitor /plugins
```

Manifest 是随应用构建的只读声明，数据库只保存固定单用户的启停状态、安装版本和乐观锁版本。修改数据库不能注入新的插件代码。

## 当前第一方插件

| ID | 名称 | 当前状态 | 完整活动阶段 |
|---|---|---|---|
| `study.memorization` | 背书训练 | Manifest 与启停基础 | Phase 7.3 |
| `study.problem-solving` | 解题训练 | Manifest 与启停基础 | Phase 7.4 |

启用“插件基础”不会让尚未实现的活动伪装成可用功能。页面会持续展示其开发阶段。

## 兼容规则

- Manifest Schema：`1`。
- 当前宿主 Plugin API：实验版 `0.1.0`。
- 第一方插件声明半开范围，例如 `>=0.1.0 <0.2.0`。
- 宿主版本不在范围内时，插件保持可发现但有效停用；启用请求返回稳定的 `PLUGIN_INCOMPATIBLE`。
- API 范围、Manifest 结构或重复 ID 无效时只隔离该项，不阻塞 Chat、Task、Inbox 或其他插件。

## 安全与能力边界

`requestedCapabilities` 只是 Manifest 声明，不是授权。Phase 7.1 没有插件执行器或能力入口；插件不能访问数据库、模型、Prompt、记忆、任务、通知、网络、文件或原生系统能力。

Phase 7.2 才会增加用户级授权、Capability Gateway、隔离存储、配额和审计。第三方安装包、动态原生代码、插件市场与热重载仍不在近期范围。
