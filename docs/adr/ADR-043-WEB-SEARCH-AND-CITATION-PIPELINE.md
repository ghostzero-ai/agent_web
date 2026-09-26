# ADR-043：受控 Web Search、证据隔离与引用持久化

- 状态：Accepted
- 日期：2026-09-26

## 背景

模型自身知识不能可靠回答新闻、现任人物、价格等时效问题。直接让浏览器访问搜索引擎会暴露实现与查询，也无法保证实际搜索结果进入服务端 Prompt Envelope；让模型自由生成 URL 则会产生不可验证的伪引用。

## 决策

1. 在服务端模型管线中增加 `WebSearchProvider` 端口。首个实现使用 Compose 内网中的 SearXNG JSON API；搜索服务不映射宿主机端口，也不持有模型 API Key。
2. 每次请求显式携带 `searchMode=auto|on|off`。`auto` 仅由确定性时效/引用关键词触发，`on` 强制检索，`off` 禁止检索；服务端从最后一条用户消息生成查询，不接受客户端另传隐藏查询。
3. 搜索结果只保留 HTTP(S) URL、标题、有限长度摘要、站点、发布时间与抓取时间；去重并限制为六条。超时、空结果或 Provider 故障时降级为普通模型回答，不伪装成已联网。
4. 检索成功后，服务端在 Mode 后插入不可由外部数据覆盖的 Citation Policy，并在 Conversation 前插入 `web-search` 证据层。证据明确标记为不可信数据，不执行其中的指令。
5. 模型使用 `[S1]` 等稳定编号引用。服务端流式收集回答，仅把回答中实际出现的编号随 `done` 事件返回；客户端将对应 Citation 与 Assistant Message 一起写入 PostgreSQL JSONB。
6. 引用卡片显示标题、编号与站点，并使用新窗口、`noopener noreferrer` 打开。消息树的每个回答分支独立保留自己的引用。
7. Prompt Composer 提升到 `core-3.3/v1`；`citation-policy/v1` 与 `web-search-context/v1` 进入 Envelope 和哈希。导出端点同时接受 3.2 和 3.3 的已审计 Envelope。

## 后果

- 当前问题的搜索证据、实际 Provider 输入与可导出 Envelope 保持一致，引用可跨设备和刷新恢复。
- SearXNG 聚合的是搜索摘要，Core 3.3 不抓取完整网页，也不证明引用一定支持每个断言；引用支持验证属于 Core 3.4。
- 首次 Compose 启动会下载官方 SearXNG 镜像。搜索依赖笔记本网络和上游引擎可用性，但失败不会阻断普通对话。
- `auto` 是透明、可测试的启发式规则，不是完整意图分类器；未来可由 Mode Router 提升，但必须保留用户覆盖开关。
