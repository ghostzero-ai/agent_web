const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function shanghaiParts(instant: Date) {
  const shifted = new Date(instant.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function shanghaiLocalInstant(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      Math.floor(minuteOfDay / 60),
      minuteOfDay % 60,
    ) - SHANGHAI_OFFSET_MS,
  );
}

export function nextAllowedPushAt(
  now: Date,
  preferences: {
    quietHoursEnabled: boolean;
    quietStart: string;
    quietEnd: string;
    timezone: string;
  },
): Date {
  if (!preferences.quietHoursEnabled) return now;
  if (preferences.timezone !== "Asia/Shanghai") {
    throw new Error("Unsupported notification timezone.");
  }
  const start = minutesOfDay(preferences.quietStart);
  const end = minutesOfDay(preferences.quietEnd);
  if (start === end) throw new Error("Quiet hours start and end must differ.");

  const local = shanghaiParts(now);
  const crossesMidnight = start > end;
  const quiet = crossesMidnight
    ? local.minuteOfDay >= start || local.minuteOfDay < end
    : local.minuteOfDay >= start && local.minuteOfDay < end;
  if (!quiet) return now;

  const endTomorrow = crossesMidnight && local.minuteOfDay >= start;
  return shanghaiLocalInstant(
    local.year,
    local.month,
    local.day + (endTomorrow ? 1 : 0),
    end,
  );
}

export function retryAvailableAt(now: Date, attempt: number): Date {
  const exponent = Math.max(0, Math.min(attempt - 1, 30));
  const delayMs = Math.min(5 * 60_000 * 2 ** exponent, 6 * 60 * 60_000);
  return new Date(now.getTime() + delayMs);
}
