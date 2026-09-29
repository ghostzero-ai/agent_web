import { describe, expect, it } from "vitest";
import { verifyBasicArithmetic } from "@/lib/problemSolving/arithmeticVerifier";

describe("Phase 7.4 arithmetic verifier", () => {
  it("evaluates basic arithmetic without eval and compares a submitted answer", () => {
    expect(verifyBasicArithmetic("计算 (2 + 3) × 4", "答案是 20")).toMatchObject({
      status: "verified",
      expected: 20,
      submitted: 20,
    });
    expect(verifyBasicArithmetic("计算 18 / 3 + 2", "7")).toMatchObject({
      status: "mismatch",
      expected: 8,
      submitted: 7,
    });
  });

  it("states when a problem cannot be independently verified", () => {
    expect(verifyBasicArithmetic("分析这首诗的意象", "表达了思乡之情")).toMatchObject({
      status: "not_applicable",
      expected: null,
    });
  });
});
