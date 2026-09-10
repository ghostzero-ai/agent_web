import type { TaskScheduleValue } from "@/lib/db/schema";

export const TASK_TIMEZONE = "Asia/Shanghai";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type TaskSchedule =
  | { type: "once"; runAt: string }
  | { type: "daily"; time: string }
  | { type: "weekly"; weekday: number; time: string };

export type NormalizedTaskSchedule = {
  scheduleType: TaskSchedule["type"];
  scheduleValue: TaskScheduleValue;
  timezone: typeof TASK_TIMEZONE;
  nextRunAt: Date;
};

export class TaskScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskScheduleError";
  }
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new TaskScheduleError("Time must use HH:mm format.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function shanghaiDateParts(date: Date) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(),
  };
}

function shanghaiInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(
    Date.UTC(year, month, day, hour, minute) - SHANGHAI_OFFSET_MS,
  );
}

export function normalizeTaskSchedule(
  schedule: TaskSchedule,
  now = new Date(),
): NormalizedTaskSchedule {
  if (schedule.type === "once") {
    const nextRunAt = new Date(schedule.runAt);
    if (Number.isNaN(nextRunAt.getTime())) {
      throw new TaskScheduleError("One-time runAt must be a valid ISO timestamp.");
    }
    if (nextRunAt.getTime() <= now.getTime()) {
      throw new TaskScheduleError("One-time task must be scheduled in the future.");
    }
    return {
      scheduleType: "once",
      scheduleValue: { runAt: nextRunAt.toISOString() },
      timezone: TASK_TIMEZONE,
      nextRunAt,
    };
  }

  const { hour, minute } = parseTime(schedule.time);
  const parts = shanghaiDateParts(now);
  let nextRunAt = shanghaiInstant(
    parts.year,
    parts.month,
    parts.day,
    hour,
    minute,
  );

  if (schedule.type === "daily") {
    if (nextRunAt.getTime() <= now.getTime()) {
      nextRunAt = new Date(nextRunAt.getTime() + 24 * 60 * 60 * 1000);
    }
    return {
      scheduleType: "daily",
      scheduleValue: { time: schedule.time },
      timezone: TASK_TIMEZONE,
      nextRunAt,
    };
  }

  if (!Number.isInteger(schedule.weekday) || schedule.weekday < 1 || schedule.weekday > 7) {
    throw new TaskScheduleError("Weekly weekday must be an integer from 1 to 7.");
  }
  const daysAhead = (schedule.weekday - parts.weekday + 7) % 7;
  nextRunAt = new Date(nextRunAt.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  if (nextRunAt.getTime() <= now.getTime()) {
    nextRunAt = new Date(nextRunAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return {
    scheduleType: "weekly",
    scheduleValue: { weekday: schedule.weekday, time: schedule.time },
    timezone: TASK_TIMEZONE,
    nextRunAt,
  };
}

export function scheduleFromStored(
  scheduleType: TaskSchedule["type"],
  value: TaskScheduleValue,
): TaskSchedule {
  if (scheduleType === "once" && "runAt" in value) {
    return { type: "once", runAt: value.runAt };
  }
  if (scheduleType === "daily" && "time" in value && !("weekday" in value)) {
    return { type: "daily", time: value.time };
  }
  if (scheduleType === "weekly" && "weekday" in value && "time" in value) {
    return { type: "weekly", weekday: value.weekday, time: value.time };
  }
  throw new TaskScheduleError("Stored task schedule does not match its type.");
}
