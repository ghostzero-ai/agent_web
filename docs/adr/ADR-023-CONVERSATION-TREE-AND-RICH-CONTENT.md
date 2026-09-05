# ADR-023：树形对话与安全富内容渲染

## 状态

Accepted

## 背景

原型把会话保存为线性 `messages[]`，并在单条 Assistant 消息中维护 `versions[]`。该结构能安全表达最后一条回答的多个候选，但重新生成历史回答时，后续消息仍然显示，导致当前回答与后续对话之间失去因果一致性。

消息正文原本作为 React 文本节点展示。它能避免直接执行 HTML，但不能渲染 Markdown、表格、代码块和数学公式。未来的 HTML 网页预览还需要比普通富文本更强的隔离边界。

## 决策

### 1. 会话使用父子消息树

- `Session.schemaVersion = 2` 标识树形会话。
- 每条消息通过 `parentId` 指向其直接上下文父节点。
- `Session.activeLeafId` 指向当前分支的活动叶节点。
- 页面、Prompt 和记忆压缩只读取从活动叶节点回溯到根节点的路径。
- 重新生成 Assistant 时，新回答与旧回答共享同一个父节点，旧回答及其后续节点不删除。
- 切换回答版本时，恢复该兄弟节点子树中最近的叶路径。

```ts
type ChatMessage = {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  content: string;
};

type Session = {
  schemaVersion: 2;
  activeLeafId: string | null;
  messages: ChatMessage[];
};
```

当前 TypeScript 类型暂时保留部分可选字段，以读取旧 localStorage 数据；所有进入运行时 Backend 的 Session 都会先标准化为 v2。

### 2. 旧数据采用无损迁移

- 旧线性消息按顺序转换为父子链。
- 旧 Assistant 的 `versions[]` 转换为共享父节点的兄弟消息。
- 原 `activeVersion` 承接后续链路。
- 其他旧版本作为无后续的兄弟叶节点保留。
- localStorage 键仍为 `agent_chat_sessions`，只升级值的 Schema，不新增键。

### 3. 普通回答使用安全 Markdown

- 使用 `react-markdown` 渲染 CommonMark。
- 使用 `remark-gfm` 支持表格、任务列表等 GFM 语法。
- 使用 `remark-math` 与 `rehype-katex` 渲染行内和块级公式。
- 不引入 `rehype-raw`，模型返回的原始 HTML 不进入宿主 DOM。
- 链接在新窗口打开，并添加 `noopener noreferrer`。
- HTML 源码应放在 fenced code block 中展示。

### 4. 可执行 HTML 使用独立 Artifact

完整 HTML/CSS/JavaScript 预览不作为普通 Markdown 自动执行。后续引入：

```ts
type ContentBlock =
  | { type: "markdown"; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "artifact_ref"; artifactId: string };
```

HTML Artifact 必须通过显式“预览”操作进入 sandboxed iframe；默认禁用脚本、同源访问、弹窗、顶层导航和外部网络。开放脚本时仍不得开放 `allow-same-origin`，并必须附加独立 CSP。

## 备选方案

1. 只允许重新生成最后一条回答：实现简单，但不能达到目标中的历史分支体验。
2. 重新生成时删除后续消息：上下文一致，但会丢失用户已有内容。
3. 每个版本复制成独立 Session：可行，但侧栏、重命名、删除和统计需要额外的会话家族折叠逻辑。
4. 直接渲染模型 HTML：实现最短，但会把模型输出变成 XSS 和密钥窃取入口，因此拒绝。

## 后果

### 正面

- 历史重新生成不再污染后续上下文。
- 旧路径不会因为尝试新回答而丢失。
- 领域模型不依赖 localStorage，未来可直接映射到 PostgreSQL 的 `parent_message_id`。
- 数学、代码和结构化文字具备统一渲染入口。

### 代价

- UI 需要区分“所有节点”和“当前活动路径”。
- 切换版本必须持久化活动叶节点。
- 数据库阶段需要为父节点、自引用外键和活动叶节点设计迁移顺序。
- Agent 工具产生的外部副作用不会随分支自动撤销，后续必须增加 Side-effect Gate 与审计记录。
