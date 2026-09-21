import { describe, expect, it, vi } from "vitest";
import {
  cancelDiagnosticNotification,
  createCapacitorLocalNotificationAdapter,
  DIAGNOSTIC_NOTIFICATION_ID,
  DIAGNOSTIC_NOTIFICATION_SOURCE,
  getLocalNotificationDiagnostics,
  localNotificationDeepLink,
  nativeNotificationFromReminder,
  notificationIdForTask,
  scheduleDiagnosticNotification,
  TASK_NOTIFICATION_SOURCE,
} from "@/lib/platform/capacitorLocalNotifications";
import type { LocalReminderSnapshot } from "@/lib/platform/capabilities";

function reminder(overrides: Partial<LocalReminderSnapshot> = {}): LocalReminderSnapshot {
  return {
    taskId: "550e8400-e29b-41d4-a716-446655440000",
    occurrenceId: "task:1:2030",
    title: "学习提醒",
    body: "复习单词",
    scheduledAt: "2030-01-01T12:00:00.000Z",
    deepLink: "/tasks?task=550e8400-e29b-41d4-a716-446655440000",
    ...overrides,
  };
}

function plugin(overrides: Record<string, unknown> = {}) {
  return {
    checkPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
    requestPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
    createChannel: vi.fn().mockResolvedValue(undefined),
    getPending: vi.fn().mockResolvedValue({ notifications: [] }),
    getDeliveredNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
    checkExactNotificationSetting: vi.fn().mockResolvedValue({ exact_alarm: "granted" }),
    removeDeliveredNotificationsById: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue({ notifications: [] }),
    ...overrides,
  };
}

describe("Capacitor local notification adapter", () => {
  it("uses stable positive Android notification ids", () => {
    const first = notificationIdForTask("task-1");
    expect(first).toBe(notificationIdForTask("task-1"));
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(2_147_483_647);
    expect(first).not.toBe(notificationIdForTask("task-2"));
  });

  it("maps absolute, daily and project weekdays to native schedules", () => {
    expect(nativeNotificationFromReminder(reminder()).schedule?.at).toEqual(
      new Date("2030-01-01T12:00:00.000Z"),
    );
    expect(
      nativeNotificationFromReminder(
        reminder({ recurrence: { type: "daily", hour: 20, minute: 5 } }),
      ).schedule,
    ).toMatchObject({ on: { hour: 20, minute: 5, second: 0 } });
    expect(
      nativeNotificationFromReminder(
        reminder({
          recurrence: { type: "weekly", weekday: 7, hour: 9, minute: 30 },
        }),
      ).schedule,
    ).toMatchObject({ on: { weekday: 1, hour: 9, minute: 30 } });
  });

  it("cancels stale owned notifications and preserves matching occurrences", async () => {
    const current = reminder();
    const stale = reminder({ taskId: "stale", occurrenceId: "old" });
    const nativeCurrent = nativeNotificationFromReminder(current);
    const nativeStale = nativeNotificationFromReminder(stale);
    const fake = plugin({
      getPending: vi.fn().mockResolvedValue({
        notifications: [nativeCurrent, nativeStale],
      }),
    });
    const adapter = createCapacitorLocalNotificationAdapter(fake);

    await expect(adapter.reconcile([current])).resolves.toEqual({
      scheduled: 0,
      cancelled: 1,
      pending: 1,
      warning: undefined,
    });
    expect(fake.cancel).toHaveBeenCalledWith({
      notifications: [{ id: nativeStale.id }],
    });
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("surfaces permission state and exact-alarm fallback warnings", async () => {
    const fake = plugin({
      checkPermissions: vi.fn().mockResolvedValue({ display: "prompt-with-rationale" }),
      schedule: vi.fn().mockResolvedValue({
        notifications: [],
        warning: { code: "EXACT_FALLBACK", message: "已改用非精确提醒" },
      }),
    });
    const adapter = createCapacitorLocalNotificationAdapter(fake);

    await expect(adapter.checkPermission()).resolves.toBe("prompt");
    await expect(adapter.reconcile([reminder()])).resolves.toMatchObject({
      scheduled: 1,
      warning: "已改用非精确提醒",
    });
  });

  it("keeps Android 7 scheduling when notification channels are unavailable", async () => {
    const unavailable = Object.assign(new Error("Not available"), {
      code: "UNAVAILABLE",
    });
    const fake = plugin({
      createChannel: vi.fn().mockRejectedValue(unavailable),
    });
    const adapter = createCapacitorLocalNotificationAdapter(fake);

    await expect(adapter.reconcile([reminder()])).resolves.toMatchObject({
      scheduled: 1,
      pending: 1,
    });
    expect(fake.schedule).toHaveBeenCalledOnce();
  });

  it("schedules one reusable 10-second diagnostic notification", async () => {
    const fake = plugin();
    const before = Date.now();
    const result = await scheduleDiagnosticNotification(10_000, fake);
    const scheduled = fake.schedule.mock.calls[0][0].notifications[0];

    expect(new Date(result.scheduledAt).getTime()).toBeGreaterThanOrEqual(before + 10_000);
    expect(scheduled).toMatchObject({
      id: DIAGNOSTIC_NOTIFICATION_ID,
      channelId: "task-reminders-v1",
      extra: {
        source: DIAGNOSTIC_NOTIFICATION_SOURCE,
        deepLink: "/notifications",
      },
    });
    expect(fake.cancel).toHaveBeenCalledWith({
      notifications: [{ id: DIAGNOSTIC_NOTIFICATION_ID }],
    });
  });

  it("reports pending and delivered notification diagnostics", async () => {
    const taskNotification = nativeNotificationFromReminder(reminder());
    const fake = plugin({
      getPending: vi.fn().mockResolvedValue({
        notifications: [
          taskNotification,
          { id: DIAGNOSTIC_NOTIFICATION_ID, extra: { source: DIAGNOSTIC_NOTIFICATION_SOURCE } },
        ],
      }),
      getDeliveredNotifications: vi.fn().mockResolvedValue({
        notifications: [{ id: DIAGNOSTIC_NOTIFICATION_ID }],
      }),
    });

    await expect(getLocalNotificationDiagnostics(fake)).resolves.toEqual({
      displayPermission: "granted",
      exactAlarmPermission: "granted",
      pendingTotal: 2,
      pendingTasks: 1,
      pendingDiagnostic: true,
      deliveredTotal: 1,
      deliveredDiagnostic: true,
    });
  });

  it("cancels the reusable diagnostic notification", async () => {
    const fake = plugin();

    await cancelDiagnosticNotification(fake);

    expect(fake.cancel).toHaveBeenCalledWith({
      notifications: [{ id: DIAGNOSTIC_NOTIFICATION_ID }],
    });
  });

  it("accepts only app-owned relative notification deep links", () => {
    const extra = {
      source: TASK_NOTIFICATION_SOURCE,
      taskId: "task-1",
      occurrenceId: "occurrence-1",
      deepLink: "/tasks?task=task-1",
    };
    expect(localNotificationDeepLink({ extra })).toBe("/tasks?task=task-1");
    expect(localNotificationDeepLink({ extra: { ...extra, deepLink: "//evil.test" } })).toBeNull();
    expect(localNotificationDeepLink({ extra: { ...extra, source: "other" } })).toBeNull();
    expect(
      localNotificationDeepLink({
        extra: {
          source: DIAGNOSTIC_NOTIFICATION_SOURCE,
          deepLink: "/notifications",
          scheduledAt: "2030-01-01T12:00:00.000Z",
        },
      }),
    ).toBe("/notifications");
  });
});
