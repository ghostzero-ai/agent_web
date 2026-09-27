import { describe, expect, it } from "vitest";
import { extractMemoryCandidate } from "@/lib/memory/candidateExtractor";

describe("memory candidate extraction", () => {
  it("extracts explicit durable preferences without saving them directly", () => {
    expect(extractMemoryCandidate("我更喜欢先看例子，再学习抽象概念。"))
      .toMatchObject({
        kind: "preference",
        sensitivity: "low",
        confidence: 86,
        content: "我更喜欢先看例子，再学习抽象概念。",
      });
  });

  it("accepts an explicit remember request but marks sensitive content", () => {
    expect(extractMemoryCandidate("请记住：我的病史需要在高强度运动建议中考虑"))
      .toMatchObject({
        kind: "fact",
        sensitivity: "sensitive",
        confidence: 95,
        content: "我的病史需要在高强度运动建议中考虑",
      });
  });

  it.each([
    "我应该怎样学习线性代数？",
    "我今天想学习线性代数",
    "我希望你帮我解答这道题",
    "请记住：我的 API_KEY 是 secret-value",
    "请记住：我的密钥是 sk-1234567890abcdef",
    "请总结刚才的讨论",
  ])("rejects questions, temporary requests and secrets: %s", (content) => {
    expect(extractMemoryCandidate(content)).toBeNull();
  });
});
