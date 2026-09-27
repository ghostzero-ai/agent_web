import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReflectionPreferenceManager } from "@/components/reflection/ReflectionPreferenceManager";

describe("reflection preference presentation", () => {
  it("renders a stable loading state before preferences arrive", () => {
    const html = renderToStaticMarkup(<ReflectionPreferenceManager />);
    expect(html).toContain("正在读取思考问题设置");
  });
});
