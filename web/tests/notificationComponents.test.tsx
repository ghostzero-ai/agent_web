import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";

describe("notification settings presentation", () => {
  it("renders a stable loading state before browser capability detection", () => {
    const html = renderToStaticMarkup(<NotificationSettings />);
    expect(html).toContain("正在读取通知设置");
  });
});
