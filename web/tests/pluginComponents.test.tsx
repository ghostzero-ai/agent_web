import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginManager } from "@/components/plugins/PluginManager";

describe("plugin presentation", () => {
  it("renders a stable loading state before hydration", () => {
    expect(renderToStaticMarkup(<PluginManager />)).toContain(
      "正在读取第一方插件",
    );
  });
});
