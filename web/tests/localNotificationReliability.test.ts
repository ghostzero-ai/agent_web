import { describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "@/lib/api/taskClient";
import {
  createLocalReminderCache,
  reconcileAndCacheLocalTaskNotifications,
  reconcileLocalTaskNotificationsWithFallback,
} from "@/lib/notifications/localNotificationReliability";
import type {
  LocalNotificationAdapter,
  LocalReminderSnapshot,
} from "@/lib/platform/capabilities";

function task(): TaskRecord {
  return {
    id: "task-1",
    title: "复习单词",
    prompt: null,
    kind: "reminder",
    scheduleType: "daily",
    scheduleValue: { time: "20:05" },
    timezone: "Asia/Shanghai",
    nextRunAt: "2030-01-01T12:05:00.000Z",
    status: "active",
    version: 3,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
  };
}

function reminder(): LocalReminderSnapshot {
  return {
    taskId: "task-1",
    occurrenceId: "task-1:3:2030-01-01T12:05:00.000Z",
    title: "学习提醒",
    body: "复习单词",
    scheduledAt: "2030-01-01T12:05:00.000Z",
    deepLink: "/tasks?task=task-1",
    recurrence: { type: "daily", hour: 20, minute: 5 },
  };
}

function preferences(initial: string | null = null) {
  let value = initial;
  return {
    get: vi.fn(async () => ({ value })),
    set: vi.fn(async ({ value: next }: { key: string; value: string }) => {
      value = next;
    }),
    remove: vi.fn(async () => {
      value = null;
    }),
  };
}

function adapter(): LocalNotificationAdapter {
  return {
    reconcile: vi.fn().mockResolvedValue({
      scheduled: 1,
      cancelled: 0,
      pending: 1,
    }),
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
  };
}

describe("local notification reliability", () => {
  it("stores and validates a minimal device reminder snapshot", async () => {
    const store = preferences();
    const cache = createLocalReminderCache(store);

    const savedAt = await cache.write([reminder()]);

    await expect(cache.read()).resolves.toEqual({
      savedAt,
      reminders: [reminder()],
    });
    const serialized = store.set.mock.calls[0][0].value;
    expect(serialized).not.toContain("prompt");
    expect(serialized).toContain("复习单词");
  });

  it("removes a corrupt cache instead of scheduling untrusted data", async () => {
    const store = preferences('{"version":1,"savedAt":"bad","reminders":[]}');
    const cache = createLocalReminderCache(store);

    await expect(cache.read()).resolves.toBeNull();
    expect(store.remove).toHaveBeenCalledOnce();
  });

  it("uses server tasks when online and updates the device cache", async () => {
    const nativeAdapter = adapter();
    const cache = createLocalReminderCache(preferences());

    await expect(
      reconcileAndCacheLocalTaskNotifications(nativeAdapter, [task()], cache),
    ).resolves.toMatchObject({ source: "server", pending: 1 });
    expect(nativeAdapter.reconcile).toHaveBeenCalledWith([
      expect.objectContaining({ taskId: "task-1" }),
    ]);
    await expect(cache.read()).resolves.toMatchObject({
      reminders: [expect.objectContaining({ taskId: "task-1" })],
    });
  });

  it("reconciles from the last device snapshot while the server is offline", async () => {
    const nativeAdapter = adapter();
    const cache = createLocalReminderCache(preferences());
    await cache.write([reminder()]);

    await expect(
      reconcileLocalTaskNotificationsWithFallback(
        nativeAdapter,
        async () => {
          throw new Error("network unavailable");
        },
        cache,
      ),
    ).resolves.toMatchObject({
      source: "device-cache",
      pending: 1,
      warning: expect.stringContaining("设备中最近一次同步"),
    });
    expect(nativeAdapter.reconcile).toHaveBeenCalledWith([reminder()]);
  });
});
