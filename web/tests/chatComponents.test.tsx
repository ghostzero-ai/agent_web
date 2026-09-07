import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatErrorBanner } from "@/components/chat/ChatErrorBanner";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import {
  MarkdownMessage,
  normalizeMathDelimiters,
} from "@/components/chat/MarkdownMessage";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import type { ChatMessage, Session } from "@/lib/config";

const noop = vi.fn();

describe("chat presentation components", () => {
  it("renders the header and API configuration link", () => {
    const html = renderToStaticMarkup(
      <ChatHeader onOpenSidebar={noop} sidebarOpen />,
    );

    expect(html).toContain("AI 对话");
    expect(html).toContain('href="/api-key"');
    expect(html).toContain("API 配置");
    expect(html).toContain("打开对话列表");
    expect(html).toContain("mobile-session-drawer");
    expect(html).toContain('aria-expanded="true"');
  });

  it("renders a dismissible configuration error", () => {
    const html = renderToStaticMarkup(
      <ChatErrorBanner message="缺少 API Key" onDismiss={noop} />,
    );

    expect(html).toContain("缺少 API Key");
    expect(html).toContain("前往配置");
    expect(html).toContain("关闭");
  });

  it("renders both empty and populated session sidebars", () => {
    const emptyHtml = renderToStaticMarkup(
      <SessionSidebar
        sessions={[]}
        activeSessionId={null}
        onCreate={noop}
        onSelect={noop}
        onDelete={noop}
      />,
    );
    expect(emptyHtml).toContain("暂无对话，点击上方按钮开始");

    const session: Session = {
      id: "session-1",
      title: "测试会话",
      messages: [],
      updatedAt: Date.now(),
    };
    const populatedHtml = renderToStaticMarkup(
      <SessionSidebar
        sessions={[session]}
        activeSessionId={session.id}
        onCreate={noop}
        onSelect={noop}
        onDelete={noop}
      />,
    );

    expect(populatedHtml).toContain("+ 新建对话");
    expect(populatedHtml).toContain("测试会话");
    expect(populatedHtml).toContain("删除对话");
    expect(populatedHtml).toContain("bg-zinc-200");

    const mobileHtml = renderToStaticMarkup(
      <SessionSidebar
        sessions={[session]}
        activeSessionId={session.id}
        onCreate={noop}
        onSelect={noop}
        onDelete={noop}
        mobile
        onClose={noop}
      />,
    );
    expect(mobileHtml).toContain("对话列表");
    expect(mobileHtml).toContain("关闭对话列表");
    expect(mobileHtml).toContain("opacity-100");
  });

  it("renders the correct message-list empty states", () => {
    const withoutSession = renderToStaticMarkup(
      <MessageList
        hasActiveSession={false}
        messages={[]}
        allMessages={[]}
        loading={false}
        onRetry={noop}
        onSwitchVersion={noop}
      />,
    );
    const emptySession = renderToStaticMarkup(
      <MessageList
        hasActiveSession
        messages={[]}
        allMessages={[]}
        loading={false}
        onRetry={noop}
        onSwitchVersion={noop}
      />,
    );

    expect(withoutSession).toContain("打开对话列表并点击「新建对话」开始");
    expect(emptySession).toContain("输入问题，AI 将为你提供帮助");
  });

  it("renders message versions and retry controls", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        parentId: null,
        role: "user",
        content: "问题",
        createdAt: 1_700_000_000_000,
      },
      {
        id: "assistant-2",
        parentId: "user-1",
        role: "assistant",
        content: "第二版回答",
        createdAt: 1_700_000_001_000,
      },
    ];
    const allMessages: ChatMessage[] = [
      messages[0],
      {
        id: "assistant-1",
        parentId: "user-1",
        role: "assistant",
        content: "第一版回答",
      },
      messages[1],
    ];

    const html = renderToStaticMarkup(
      <MessageList
        hasActiveSession
        messages={messages}
        allMessages={allMessages}
        loading={false}
        onRetry={noop}
        onSwitchVersion={noop}
      />,
    );

    expect(html).toContain("问题");
    expect(html).toContain("第二版回答");
    expect(html).toContain("2/2");
    expect(html).toContain("重新生成");
  });

  it("renders the thinking state without retry actions", () => {
    const html = renderToStaticMarkup(
      <MessageList
        hasActiveSession
        messages={[
          {
            id: "assistant-1",
            parentId: null,
            role: "assistant",
            content: "已有回复",
          },
        ]}
        allMessages={[
          {
            id: "assistant-1",
            parentId: null,
            role: "assistant",
            content: "已有回复",
          },
        ]}
        loading
        onRetry={noop}
        onSwitchVersion={noop}
      />,
    );

    expect(html).toContain("AI 思考中...");
    expect(html).not.toContain("重新生成");
  });

  it("renders Markdown math and keeps raw HTML non-executable", () => {
    const html = renderToStaticMarkup(
      <MarkdownMessage
        content={"公式：$E = mc^2$\n\n```html\n<button>示例</button>\n```\n\n<script>alert('xss')</script>"}
      />,
    );

    expect(html).toContain("katex");
    expect(html).toContain("language-html");
    expect(html).toContain("&lt;button&gt;示例&lt;/button&gt;");
    expect(html).not.toContain("<script>");
  });

  it("supports slash math delimiters without rewriting code examples", () => {
    const normalized = normalizeMathDelimiters(
      "行内：\\(x^2\\)\n\n\\[y^2\\]\n\n`\\(inline code\\)`\n\n```tex\n\\[fenced code\\]\n```",
    );
    const html = renderToStaticMarkup(<MarkdownMessage content={normalized} />);

    expect(normalized).toContain("行内：$x^2$");
    expect(normalized).toContain("$$\ny^2\n$$");
    expect(normalized).toContain("`\\(inline code\\)`");
    expect(normalized).toContain("\\[fenced code\\]");
    expect(html.match(/class="katex"/g)).toHaveLength(2);
  });

  it("switches the composer between send and stop modes", () => {
    const readyHtml = renderToStaticMarkup(
      <ChatComposer
        value="待发送内容"
        loading={false}
        onChange={noop}
        onSend={noop}
        onStop={noop}
      />,
    );
    const loadingHtml = renderToStaticMarkup(
      <ChatComposer
        value=""
        loading
        onChange={noop}
        onSend={noop}
        onStop={noop}
      />,
    );

    expect(readyHtml).toContain("待发送内容");
    expect(readyHtml).toContain("发送");
    expect(readyHtml).not.toContain("停止生成");
    expect(loadingHtml).toContain("停止生成");
    expect(loadingHtml).toContain("disabled");
  });
});
