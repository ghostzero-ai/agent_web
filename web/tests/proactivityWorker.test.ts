import { describe, expect, it, vi } from "vitest";
import { runProactivityBatch } from "@/lib/proactivity/proactivityWorker";

describe("proactivity worker", () => {
  it("evaluates the durable policy at the supplied worker instant", async () => {
    const now = new Date("2026-09-28T04:00:00.000Z");
    const evaluate = vi.fn().mockResolvedValue({
      status: "skipped",
      code: "daily_budget",
    });
    await expect(runProactivityBatch({
      repository: { evaluate },
      now: () => now,
    })).resolves.toEqual({ status: "skipped", code: "daily_budget" });
    expect(evaluate).toHaveBeenCalledWith(now);
  });
});
