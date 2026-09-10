import { describe, expect, it } from "vitest";
import {
  normalizeTaskSchedule,
  scheduleFromStored,
  TaskScheduleError,
} from "@/lib/tasks/schedule";

describe("task schedule", () => {
  const now = new Date("2026-09-10T01:30:00.000Z"); // 上海 09:30，周四

  it("normalizes a future one-time schedule", () => {
    const result = normalizeTaskSchedule(
      { type: "once", runAt: "2026-09-11T02:00:00.000Z" },
      now,
    );
    expect(result).toMatchObject({
      scheduleType: "once",
      scheduleValue: { runAt: "2026-09-11T02:00:00.000Z" },
      timezone: "Asia/Shanghai",
    });
    expect(result.nextRunAt.toISOString()).toBe("2026-09-11T02:00:00.000Z");
  });

  it("moves elapsed daily and weekly times to their next occurrence", () => {
    expect(
      normalizeTaskSchedule({ type: "daily", time: "09:00" }, now).nextRunAt.toISOString(),
    ).toBe("2026-09-11T01:00:00.000Z");
    expect(
      normalizeTaskSchedule(
        { type: "weekly", weekday: 4, time: "09:00" },
        now,
      ).nextRunAt.toISOString(),
    ).toBe("2026-09-17T01:00:00.000Z");
    expect(
      normalizeTaskSchedule(
        { type: "weekly", weekday: 5, time: "10:00" },
        now,
      ).nextRunAt.toISOString(),
    ).toBe("2026-09-11T02:00:00.000Z");
  });

  it("rejects past or malformed schedules", () => {
    expect(() =>
      normalizeTaskSchedule({ type: "once", runAt: "2026-09-09T00:00:00Z" }, now),
    ).toThrow(TaskScheduleError);
    expect(() =>
      normalizeTaskSchedule({ type: "daily", time: "25:00" }, now),
    ).toThrow("HH:mm");
    expect(() =>
      normalizeTaskSchedule({ type: "weekly", weekday: 0, time: "10:00" }, now),
    ).toThrow("1 to 7");
  });

  it("restores only matching stored schedule shapes", () => {
    expect(scheduleFromStored("daily", { time: "08:30" })).toEqual({
      type: "daily",
      time: "08:30",
    });
    expect(() => scheduleFromStored("once", { time: "08:30" })).toThrow(
      TaskScheduleError,
    );
  });
});
