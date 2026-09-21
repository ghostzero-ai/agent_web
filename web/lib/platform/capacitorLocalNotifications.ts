import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
  type PermissionStatus,
  type ScheduleResult,
} from "@capacitor/local-notifications";
import type {
  LocalNotificationAdapter,
  LocalNotificationSyncResult,
  LocalReminderSnapshot,
} from "@/lib/platform/capabilities";

export const TASK_NOTIFICATION_CHANNEL_ID = "task-reminders-v1";
export const TASK_NOTIFICATION_SOURCE = "task-reminder-v1";

type CapacitorLocalNotificationsPort = {
  checkPermissions(): Promise<PermissionStatus>;
  requestPermissions(): Promise<PermissionStatus>;
  createChannel(options: {
    id: string;
    name: string;
    description?: string;
    importance?: 0 | 1 | 2 | 3 | 4 | 5;
    visibility?: -1 | 0 | 1;
    vibration?: boolean;
  }): Promise<void>;
  getPending(): Promise<{ notifications: PendingLocalNotificationSchema[] }>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
  schedule(options: {
    notifications: LocalNotificationSchema[];
  }): Promise<ScheduleResult>;
};

type OwnedNotificationExtra = {
  source: typeof TASK_NOTIFICATION_SOURCE;
  taskId: string;
  occurrenceId: string;
  deepLink: string;
};

function permissionState(status: PermissionStatus) {
  if (status.display === "granted") return "granted" as const;
  if (status.display === "denied") return "denied" as const;
  return "prompt" as const;
}

function isUnavailableError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "UNAVAILABLE"
  );
}

export function isCapacitorAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function notificationIdForTask(taskId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < taskId.length; index += 1) {
    hash ^= taskId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff || 1;
}

function isOwnedExtra(value: unknown): value is OwnedNotificationExtra {
  if (!value || typeof value !== "object") return false;
  const extra = value as Record<string, unknown>;
  return (
    extra.source === TASK_NOTIFICATION_SOURCE &&
    typeof extra.taskId === "string" &&
    typeof extra.occurrenceId === "string" &&
    typeof extra.deepLink === "string"
  );
}

export function nativeNotificationFromReminder(
  reminder: LocalReminderSnapshot,
): LocalNotificationSchema {
  const schedule = reminder.recurrence
    ? reminder.recurrence.type === "daily"
      ? {
          on: {
            hour: reminder.recurrence.hour,
            minute: reminder.recurrence.minute,
            second: 0,
          },
          allowWhileIdle: true,
        }
      : {
          on: {
            weekday: ((reminder.recurrence.weekday % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
            hour: reminder.recurrence.hour,
            minute: reminder.recurrence.minute,
            second: 0,
          },
          allowWhileIdle: true,
        }
    : {
        at: new Date(reminder.scheduledAt),
        allowWhileIdle: true,
      };

  return {
    id: notificationIdForTask(reminder.taskId),
    title: reminder.title,
    body: reminder.body ?? "你安排的任务时间到了，点击打开应用。",
    schedule,
    channelId: TASK_NOTIFICATION_CHANNEL_ID,
    autoCancel: true,
    foreground: true,
    isExactNotification: true,
    isExactMandatory: false,
    extra: {
      source: TASK_NOTIFICATION_SOURCE,
      taskId: reminder.taskId,
      occurrenceId: reminder.occurrenceId,
      deepLink: reminder.deepLink,
    } satisfies OwnedNotificationExtra,
  };
}

export function createCapacitorLocalNotificationAdapter(
  plugin: CapacitorLocalNotificationsPort = LocalNotifications,
): LocalNotificationAdapter {
  return {
    async checkPermission() {
      return permissionState(await plugin.checkPermissions());
    },

    async requestPermission() {
      const state = permissionState(await plugin.requestPermissions());
      return state === "granted" ? "granted" : "denied";
    },

    async reconcile(reminders) {
      try {
        await plugin.createChannel({
          id: TASK_NOTIFICATION_CHANNEL_ID,
          name: "学习任务提醒",
          description: "你在 AI Study Companion 中设置的本地任务提醒",
          importance: 4,
          visibility: 0,
          vibration: true,
        });
      } catch (error) {
        // Android 7.x does not expose notification channels, but can still
        // schedule notifications through the plugin's default behavior.
        if (!isUnavailableError(error)) throw error;
      }

      const desired = new Map<number, LocalReminderSnapshot>();
      for (const reminder of reminders) {
        const id = notificationIdForTask(reminder.taskId);
        const collision = desired.get(id);
        if (collision && collision.taskId !== reminder.taskId) {
          throw new Error("本地通知 ID 冲突，请重新创建其中一个任务");
        }
        desired.set(id, reminder);
      }
      const pending = await plugin.getPending();
      const foreignCollision = pending.notifications.find(
        (notification) =>
          desired.has(notification.id) && !isOwnedExtra(notification.extra),
      );
      if (foreignCollision) {
        throw new Error("本地通知 ID 已被其他功能占用");
      }
      const owned = pending.notifications.filter((notification) =>
        isOwnedExtra(notification.extra),
      );
      const unchanged = new Set<number>();
      const staleIds: number[] = [];

      for (const notification of owned) {
        const reminder = desired.get(notification.id);
        if (
          reminder &&
          isOwnedExtra(notification.extra) &&
          notification.extra.occurrenceId === reminder.occurrenceId
        ) {
          unchanged.add(notification.id);
        } else {
          staleIds.push(notification.id);
        }
      }

      if (staleIds.length > 0) {
        await plugin.cancel({
          notifications: staleIds.map((id) => ({ id })),
        });
      }

      const notifications = [...desired.entries()]
        .filter(([id]) => !unchanged.has(id))
        .map(([, reminder]) => nativeNotificationFromReminder(reminder));
      let warning: string | undefined;
      if (notifications.length > 0) {
        const result = await plugin.schedule({ notifications });
        warning = result.warning?.message;
      }

      return {
        scheduled: notifications.length,
        cancelled: staleIds.length,
        pending: reminders.length,
        warning,
      } satisfies LocalNotificationSyncResult;
    },
  };
}

export function getCapacitorLocalNotificationAdapter(): LocalNotificationAdapter | null {
  return isCapacitorAndroid()
    ? createCapacitorLocalNotificationAdapter()
    : null;
}

export function localNotificationDeepLink(notification: {
  extra?: unknown;
}): string | null {
  if (!isOwnedExtra(notification.extra)) return null;
  const { deepLink } = notification.extra;
  return deepLink.startsWith("/") && !deepLink.startsWith("//")
    ? deepLink
    : null;
}
