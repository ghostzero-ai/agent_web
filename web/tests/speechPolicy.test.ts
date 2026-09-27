import { describe, expect, it } from "vitest";
import {
  prepareSpeechText,
  SPEECH_CHARACTER_LIMIT,
  splitSpeechText,
} from "@/lib/speech/speechPolicy";

describe("speech policy", () => {
  it("turns rich model output into safe, bounded spoken prose", () => {
    const prepared = prepareSpeechText(
      "# 结论\n查看 [报告](https://example.com)。$x/y$ [S2]\n```ts\nsecret()\n```",
    );
    expect(prepared).toEqual({
      text: "结论 查看 报告。 公式 来源 2 代码块已省略。",
      truncated: false,
    });
    expect(prepared.text).not.toContain("example.com");
    expect(prepared.text).not.toContain("secret");
  });

  it("truncates oversized text and splits it at useful boundaries", () => {
    const prepared = prepareSpeechText("一".repeat(SPEECH_CHARACTER_LIMIT + 50));
    expect(prepared.truncated).toBe(true);
    expect(prepared.text).toHaveLength(SPEECH_CHARACTER_LIMIT);

    const chunks = splitSpeechText("第一句很短。第二句也不长。第三句结束。", 12);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe("第一句很短。第二句也不长。第三句结束。");
    expect(chunks.every((chunk) => chunk.length <= 13)).toBe(true);
  });
});
