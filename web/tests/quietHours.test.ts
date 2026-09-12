import { describe, expect, it } from "vitest";
import { nextAllowedPushAt, retryAvailableAt } from "@/lib/notifications/quietHours";

const overnight = {
  quietHoursEnabled: true,
  quietStart: "22:00",
  quietEnd: "08:00",
  timezone: "Asia/Shanghai",
};

describe("notification quiet hours", () => {
  it("defers both sides of a quiet interval that crosses midnight", () => {
    expect(
      nextAllowedPushAt(new Date("2026-09-12T15:00:00.000Z"), overnight).toISOString(),
    ).toBe("2026-09-13T00:00:00.000Z");
    expect(
      nextAllowedPushAt(new Date("2026-09-12T23:30:00.000Z"), overnight).toISOString(),
    ).toBe("2026-09-13T00:00:00.000Z");
  });

  it("allows the exact end and daytime instants", () => {
    const exactEnd = new Date("2026-09-13T00:00:00.000Z");
    const daytime = new Date("2026-09-13T04:00:00.000Z");
    expect(nextAllowedPushAt(exactEnd, overnight)).toBe(exactEnd);
    expect(nextAllowedPushAt(daytime, overnight)).toBe(daytime);
  });

  it("supports same-day quiet intervals and disabled quiet hours", () => {
    const lunchtime = { ...overnight, quietStart: "12:00", quietEnd: "14:00" };
    expect(
      nextAllowedPushAt(new Date("2026-09-13T05:00:00.000Z"), lunchtime).toISOString(),
    ).toBe("2026-09-13T06:00:00.000Z");
    const now = new Date("2026-09-13T05:00:00.000Z");
    expect(nextAllowedPushAt(now, { ...overnight, quietHoursEnabled: false })).toBe(now);
  });

  it("uses capped exponential retry delay", () => {
    const now = new Date("2026-09-13T00:00:00.000Z");
    expect(retryAvailableAt(now, 1).toISOString()).toBe("2026-09-13T00:05:00.000Z");
    expect(retryAvailableAt(now, 4).toISOString()).toBe("2026-09-13T00:40:00.000Z");
    expect(retryAvailableAt(now, 99).toISOString()).toBe("2026-09-13T06:00:00.000Z");
  });
});
