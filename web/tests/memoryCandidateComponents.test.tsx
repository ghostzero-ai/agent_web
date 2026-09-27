import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryCandidateManager } from "@/components/memory/MemoryCandidateManager";

describe("memory candidate presentation", () => {
  it("renders a stable loading state", () => {
    expect(renderToStaticMarkup(<MemoryCandidateManager />)).toContain(
      "正在读取记忆候选",
    );
  });
});
