import { describe, expect, it } from "vitest";
import {
  CORE_QUALITY_EVAL_CASES,
  formatCoreQualityEval,
  runCoreQualityEval,
} from "@/evals/core35/coreQualityEval";

describe("Core 3.5 lightweight quality evaluation", () => {
  it("keeps a small, uniquely identified 25-case regression set", () => {
    expect(CORE_QUALITY_EVAL_CASES).toHaveLength(25);
    expect(new Set(CORE_QUALITY_EVAL_CASES.map((item) => item.id)).size).toBe(25);
  });

  it("meets the frozen mode-boundary and professional-answer baseline", () => {
    const result = runCoreQualityEval("2026-09-26T00:00:00.000Z");

    expect(result).toMatchObject({ total: 25, passed: 25, score: 100 });
    expect(result.categories).toEqual({
      "mode-boundary": { total: 12, passed: 12, score: 100 },
      "professional-answer": { total: 13, passed: 13, score: 100 },
    });
    expect(result.cases.every((item) => item.passed)).toBe(true);
  });

  it("reports scores and limitations without overstating model quality", () => {
    const output = formatCoreQualityEval(
      runCoreQualityEval("2026-09-26T00:00:00.000Z"),
    );

    expect(output).toContain("overall: 25/25 (100%)");
    expect(output).toContain("不调用真实模型");
    expect(output).toContain("不等同于事实证明");
  });
});
