import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonaProfileManager } from "@/components/persona/PersonaProfileManager";

describe("persona profile presentation", () => {
  it("renders a stable loading state before profile hydration", () => {
    expect(renderToStaticMarkup(<PersonaProfileManager />)).toContain("正在读取人格设置");
  });
});
