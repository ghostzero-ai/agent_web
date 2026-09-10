import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  inboxTimeLabel,
  InboxManager,
} from "@/components/inbox/InboxManager";

describe("inbox presentation", () => {
  it("renders mobile-safe filters and loading state", () => {
    const html = renderToStaticMarkup(<InboxManager />);
    expect(html).toContain("提醒消息");
    expect(html).toContain("正在读取提醒");
    expect(html).toContain("未读");
    expect(html).toContain("刷新");
  });

  it("formats occurrence time in Asia/Shanghai", () => {
    expect(inboxTimeLabel("2026-09-10T12:30:00.000Z")).toContain("20:30");
    expect(inboxTimeLabel("invalid")).toBe("时间未知");
  });
});
