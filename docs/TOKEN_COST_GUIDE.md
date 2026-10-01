# Token、缓存与成本

最近更新：2026-10-01。当前为 R1 实施记录；真实费用/命中收益须以正常使用后的统计或另经同意的收费对照测试为准。

## 用量查看

Web/APK 共用模型配置页面 `/api-key`，点击“查看/刷新用量”，读取 `/api/v1/model/usage` 最近七天的服务端记录。点击本身不调用模型。最多展示最近 5000 次，超限时注明截断；空白历史不补造数据。

`model_usage_calls` 保存每次实际 Provider 调用的最小元数据：业务类型、Provider Origin/Model、状态、请求尝试次数、输入/输出/缓存/推理 Token、延迟、结束原因，以及当时配置的价格与费用估算。DNS 重试计入请求尝试，不重新生成 Prompt；取消/失败若缺少 usage 则费用未知。数据不含 Key、对话、Prompt、模型回复或上游错误正文。

生产入口共用 measured Provider：聊天、AI 任务、新闻、书籍、反思、背诵评分、解题/图片题、复习卡及游戏。Mock 单元测试不写运行数据库，也不请求模型。Provider 用量写入失败或超时只记录无敏感信息的警告，不阻断回答；因此记录不是具有账单完整性保证的计费系统。

缓存命中率按已知缓存的输入 Token 加权计算；同时显示统计覆盖率。缺失字段显示未知，已知 0 才显示 0。推理 Token 是输出用量明细，不额外重复计价。取消/失败和异常终止可能仍产生服务商费用，未收到 usage 不能当作免费。

## 配置价格

服务端 `AI_TOKEN_PRICES_JSON` 默认为 `[]`，不写死任何模型的当前价格。配置对应 Provider Origin/Model 后，未来每次调用快照当时的价格；配置改变不追溯修改历史费用。金额为估算，最终以服务商账单为准，不混合不同货币。

以下数字仅用于说明格式，**不是 DeepSeek 的实际价格**；请按实际模型官方报价填写，并记录来源与日期：

```json
[
  {
    "providerOrigin": "https://api.deepseek.com",
    "model": "your-model",
    "currency": "CNY",
    "inputPerMillion": 2,
    "cachedInputPerMillion": 0.2,
    "outputPerMillion": 3,
    "source": "https://api-docs.deepseek.com/quick_start/pricing",
    "asOf": "2026-10-01"
  }
]
```

自托管配置写入本机 `.env.selfhost`，通过 Compose 同时传给 Web/Worker，随后重启相应服务；本地 npm 开发可放入 `web/.env.local`。不提交真实 Key 或本机环境文件。字段不合法时价格视为未配置；缓存/输出 usage 缺失导致费用无法可靠计算时仍显示未知。

## Provider 缓存兼容

实现前核对 [DeepSeek 缓存文档](https://api-docs.deepseek.com/guides/kv_cache/) 与 [Chat Completions 文档](https://api-docs.deepseek.com/api/create-chat-completion/)。官方缓存自动管理并匹配前缀，不能保证每次命中；实际字段以请求返回为准。

只对核验过的官方 `api.deepseek.com` 自动发送 `stream_options.include_usage`；任意兼容端点不自动假设支持。解析 `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` 与兼容的 `prompt_tokens_details.cached_tokens`，校验非负数、输入上限和合计一致性；usage-only SSE chunk 不作为回答正文。不读取或持久化 reasoning_content。

不创建人工预热请求、不填充无用 Prompt、不缓存整段个性化回答。首次冷请求、缓存过期或缓存统计不可用均不影响正常调用。

## 数据迁移

`0027_model_usage_calls.sql` 只新增用量表与索引，不改变原有业务表。`db:rollback` 在本迁移为最后一项时只删除用量表，其历史统计不可恢复，聊天/任务不受影响；必要时先备份。

仓库 0018–0026 沿用人工版本化 SQL，因此本次也采用人工 0027，不直接执行从旧 Drizzle snapshot 生成的重复建表 SQL。`db:check` 只证明 Drizzle 元数据可读，迁移正确性另外通过完整迁移/回滚集成测试验证。

## 验证边界

R1.1：相关 11 文件、45 项无付费测试通过，TypeScript/Drizzle 元数据检查通过。数据库升级、重复记录、有限读取和回滚有集成覆盖。

真实调用的缓存命中率、费用下降和回答质量尚未作收费对照验收；不能把 Mock 中的数值或通过的固定回归当作实际收益。
