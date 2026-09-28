import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProactivityManager } from "@/components/proactivity/ProactivityManager";

describe("proactivity presentation", () => {
  it("renders a stable loading state before hydration", () => {
    expect(renderToStaticMarkup(<ProactivityManager />)).toContain(
      "正在读取主动问候设置",
    );
  });
});
