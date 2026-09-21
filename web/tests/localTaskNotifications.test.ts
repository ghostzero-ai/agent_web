import { describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "@/lib/api/taskClient";
import {
  localReminderFromTask,
  localRemindersFromTasks,
  reconcileLocalTaskNotifications,
} from "@/lib/notifications/localTaskNotifications";
import type { LocalNotificationAdapter } from "@/lib/platform/capabilities";

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "复习单词",
    prompt: "不要把这段详细内容显示在通知标题中",
    kind: "reminder",
    scheduleType: "daily",
    scheduleValue: { time: "20:05" },
    timezone: "Asia/Shanghai",
    nextRunAt: "2030-01-01T12:05:00.000Z",
    status: "active",
    version: 3,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("local task reminder snapshots", () => {
  it("maps active daily and weekly tasks to native recurrence rules", () => {
    expect(localReminderFromTask(task())).toMatchObject({
      title: "学习提醒",
      body: "复习单词",
      recurrence: { type: "daily", hour: 20, minute: 5 },
      deepLink: "/tasks?task=550e8400-e29b-41d4-a716-446655440000",
    });
    expect(
      localReminderFromTask(
        task({
          scheduleType: "weekly",
          scheduleValue: { weekday: 7, time: "09:30" },
        }),
      ),
    ).toMatchObject({
      recurrence: { type: "weekly", weekday: 7, hour: 9, minute: 30 },
    });
  });

  it("keeps one-time reminders absolute and excludes inactive tasks", () => {
    expect(
      localReminderFromTask(
        task({
          scheduleType: "once",
          scheduleValue: { runAt: "2030-01-01T12:05:00.000Z" },
        }),
      )?.recurrence,
    ).toBeUndefined();
    expect(localReminderFromTask(task({ status: "paused" }))).toBeNull();
    expect(localReminderFromTask(task({ status: "completed" }))).toBeNull();
    expect(localReminderFromTask(task({ nextRunAt: null }))).toBeNull();
  });

  it("reconciles only the active task snapshot through the platform adapter", async () => {
    const reconcile = vi.fn<LocalNotificationAdapter["reconcile"]>().mockResolvedValue({
      scheduled: 1,
      cancelled: 0,
      pending: 1,
    });
    const adapter: LocalNotificationAdapter = {
      reconcile,
      checkPermission: vi.fn(),
      requestPermission: vi.fn(),
    };
    const tasks = [task(), task({ id: "paused", status: "paused" })];

    await expect(reconcileLocalTaskNotifications(adapter, tasks)).resolves.toMatchObject({
      pending: 1,
    });
    expect(localRemindersFromTasks(tasks)).toHaveLength(1);
    expect(reconcile).toHaveBeenCalledWith([expect.objectContaining({ taskId: tasks[0].id })]);
  });
});
