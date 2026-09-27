import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadingProfileManager } from "@/components/reading/ReadingProfileManager";

describe("reading profile presentation", () => {
  it("renders a stable loading state before profile hydration", () => {
    const html = renderToStaticMarkup(<ReadingProfileManager />);
    expect(html).toContain("正在读取阅读画像");
  });
});
