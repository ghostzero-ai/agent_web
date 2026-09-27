import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryManager } from "@/components/memory/MemoryManager";

describe("formal memory presentation", () => {
  it("renders a stable loading state", () => {
    expect(renderToStaticMarkup(<MemoryManager />)).toContain("正在读取长期记忆");
  });
});
