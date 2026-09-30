# Plugin API v1

状态：Frozen for first-party use

宿主版本：`1.0.0`
Manifest Schema：`1`

Plugin API v1 是背书训练与解题训练共同验证后的最小第一方扩展契约。它不是插件市场 SDK，也不允许从网络安装或执行第三方代码。

Phase 6.5 的娱乐规则包继续使用这个冻结契约：隔离存储保存配置，宿主中立游戏草稿经用户确认后调用核心 API。没有新增能力 ID、改变既有信封或提升宿主 API 版本；扩展协议见 `GAME_RULE_PACKS.md`。

## 1. 稳定范围

在 `1.x` 内保持兼容的部分：

- Manifest 的 ID、版本、贡献和能力声明语义。
- `foreground/background` 执行上下文及后台 `runId` 约束。
- `storage.read-write` 的 get/list/set/delete 请求、返回项和乐观版本锁。
- `model.generate` 的 `{ operation, input }` 信封与宿主注册操作的分发方式。
- `task.create-draft` 的 review intent、Activity ID 与“只返回草稿”语义。
- 带来源信息的中立学习卡草稿格式。
- 预编译第一方 Activity 的 Registry、路由和 Web/Android 平台声明。

Schema 的代码事实源是 `web/lib/plugins/pluginApiV1.ts`。Manifest 声明 `>=1.0.0 <2.0.0`；宿主主版本不匹配时安全停用插件。

## 2. 能力调用

所有调用都经过 Capability Gateway。调用前检查插件兼容性、安装版本、声明、逐项授权、执行上下文、每日配额和宿主 Adapter；插件不能直接取得数据库、模型密钥、Repository 或网络客户端。

### 隔离存储

```json
{ "operation": "set", "key": "materials/<id>", "value": {}, "expectedVersion": 0 }
```

返回项统一包含 `key`、`value`、`byteSize`、`version` 和 `updatedAt`。存储仍按用户与插件 ID 隔离，其他插件不能用共享 Schema 绕过隔离。

### 受控模型生成

```json
{
  "operation": "memorization.evaluate",
  "input": { "materialTitle": "...", "cue": "..." }
}
```

信封是稳定契约，具体操作由宿主静态 Registry 注册并绑定唯一插件。未知操作、重复操作、借用其他插件操作或不符合该操作 Schema 的输入都会失败。新增第一方功能只增加注册操作，不修改 Gateway 和既有操作分支；v1 不接受任意 Prompt 操作。

### 任务草稿

```json
{
  "intent": "review",
  "activityId": "memorization.review",
  "title": "复习：材料",
  "prompt": "打开活动复习。",
  "runAt": "2026-10-01T08:00:00.000Z"
}
```

Activity ID 必须由调用插件声明并由宿主 Registry 持有。Adapter 只规范化并返回草稿；只有用户再次确认，客户端才调用核心 Task API。

## 3. 学习卡与跨插件边界

`learningCardDraftSchema` 包含 `schemaVersion`、来源插件、来源 Activity、来源记录 ID，以及 `front/back/reason/tags` 内容。它是宿主可理解的中立交换格式，不是共享数据库。

- 插件不能读取或写入另一插件的隔离存储。
- 当前解题复习卡仍归解题插件所有，但创建时先通过中立草稿 Schema。
- 未来若背书、娱乐或其他活动接收学习卡，应由宿主增加显式导入/确认流程；不能通过插件间直接调用实现。

## 4. Activity UI

Activity Contribution 由 `web/lib/plugins/activityRegistry.ts` 静态登记插件归属、路由、按钮文字和支持平台。插件页只解析 Registry，不再按插件 ID 写死入口。Web 与 Capacitor 使用同一预编译 React Activity。

这只是第一方 UI 依赖边界，不是恶意代码沙箱。动态第三方 UI、iframe 消息协议、签名包和安装后新增 Android 原生能力均不属于 v1。

## 5. 版本与升级

- Plugin API 的破坏性变更需要 `2.0.0`；向后兼容的新注册操作可在 `1.x` 增加。
- 插件自身版本变化会令旧授权进入待复核状态。
- 本次背书与解题插件统一升级为 `1.0.0`，用户需要“审核并更新”后重新确认能力。
- 禁用或升级不删除插件隔离数据；核心 Chat、Task、Inbox 与历史不受影响。

## 6. v1 明确不包含

- 公共插件市场、URL/压缩包安装、远程 Manifest。
- 任意脚本、Shell、SQL、网络和模型 Prompt 执行。
- 第三方进程/容器沙箱与动态 UI 沙箱。
- 插件直接创建任务、通知或正式记忆。
- 动态加入 APK 原生代码与系统权限。
