import { describe, expect, it } from "vitest";
import {
  reviewIntervalDays,
  scoreRecitation,
  splitMemorizationText,
} from "@/lib/memorization/domain";

describe("Phase 7.3 memorization domain", () => {
  it("splits paragraphs into editable bounded knowledge units", () => {
    const units = splitMemorizationText("第一段需要背诵。\n\n第二段也需要背诵。");
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      cue: expect.stringContaining("第 1 单元"),
      content: "第一段需要背诵。",
    });
  });

  it("scores paraphrase overlap deterministically and maps intervals", () => {
    expect(scoreRecitation("实践是检验真理的唯一标准", "实践是检验真理的唯一标准"))
      .toBe(100);
    expect(scoreRecitation("实践是检验真理的唯一标准", "完全无关的句子"))
      .toBeLessThan(20);
    expect([reviewIntervalDays(40), reviewIntervalDays(70), reviewIntervalDays(85), reviewIntervalDays(95)])
      .toEqual([1, 3, 7, 14]);
  });
});
