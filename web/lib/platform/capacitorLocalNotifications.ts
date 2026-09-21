import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type DeliveredNotificationSchema,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
  type PermissionStatus,
  type ScheduleResult,
  type SettingsPermissionStatus,
} from "@capacitor/local-notifications";
import type {
  LocalNotificationAdapter,
  LocalNotificationSyncResult,
  LocalReminderSnapshot,
} from "@/lib/platform/capabilities";

export const TASK_NOTIFICATION_CHANNEL_ID = "task-reminders-v1";
export const TASK_NOTIFICATION_SOURCE = "task-reminder-v1";
export const DIAGNOSTIC_NOTIFICATION_SOURCE = "notification-diagnostic-v1";
export const DIAGNOSTIC_NOTIFICATION_ID = 2_147_483_646;

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
  getDeliveredNotifications(): Promise<{
    notifications: DeliveredNotificationSchema[];
  }>;
  checkExactNotificationSetting(): Promise<SettingsPermissionStatus>;
  removeDeliveredNotificationsById(options: { ids: number[] }): Promise<void>;
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

type DiagnosticNotificationExtra = {
  source: typeof DIAGNOSTIC_NOTIFICATION_SOURCE;
  deepLink: string;
  scheduledAt: string;
};

export type LocalNotificationDiagnostics = {
  displayPermission: "granted" | "denied" | "prompt";
  exactAlarmPermission: "granted" | "denied" | "prompt";
  pendingTotal: number;
  pendingTasks: number;
  pendingDiagnostic: boolean;
  deliveredTotal: number;
  deliveredDiagnostic: boolean;
};

export type DiagnosticScheduleResult = {
  scheduledAt: string;
  warning?: string;
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

async function ensureTaskNotificationChannel(
  plugin: CapacitorLocalNotificationsPort,
): Promise<void> {
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

function isDiagnosticExtra(value: unknown): value is DiagnosticNotificationExtra {
  if (!value || typeof value !== "object") return false;
  const extra = value as Record<string, unknown>;
  return (
    extra.source === DIAGNOSTIC_NOTIFICATION_SOURCE &&
    typeof extra.deepLink === "string" &&
    typeof extra.scheduledAt === "string"
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
      await ensureTaskNotificationChannel(plugin);

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

export async function scheduleDiagnosticNotification(
  delayMs = 10_000,
  plugin: CapacitorLocalNotificationsPort = LocalNotifications,
): Promise<DiagnosticScheduleResult> {
  const permission = permissionState(await plugin.checkPermissions());
  const granted =
    permission === "granted"
      ? permission
      : permissionState(await plugin.requestPermissions());
  if (granted !== "granted") {
    throw new Error("通知权限未开启，无法安排测试通知");
  }

  await ensureTaskNotificationChannel(plugin);
  await plugin.cancel({ notifications: [{ id: DIAGNOSTIC_NOTIFICATION_ID }] });
  await plugin.removeDeliveredNotificationsById({
    ids: [DIAGNOSTIC_NOTIFICATION_ID],
  });

  const scheduledAt = new Date(Date.now() + Math.max(1_000, delayMs));
  const result = await plugin.schedule({
    notifications: [
      {
        id: DIAGNOSTIC_NOTIFICATION_ID,
        title: "通知测试成功",
        body: "这条通知由手机系统调度，用于检查应用被清理后的提醒能力。",
        schedule: { at: scheduledAt, allowWhileIdle: true },
        channelId: TASK_NOTIFICATION_CHANNEL_ID,
        autoCancel: true,
        foreground: true,
        isExactNotification: true,
        isExactMandatory: false,
        extra: {
          source: DIAGNOSTIC_NOTIFICATION_SOURCE,
          deepLink: "/notifications",
          scheduledAt: scheduledAt.toISOString(),
        } satisfies DiagnosticNotificationExtra,
      },
    ],
  });

  return {
    scheduledAt: scheduledAt.toISOString(),
    warning: result.warning?.message,
  };
}

export async function cancelDiagnosticNotification(
  plugin: CapacitorLocalNotificationsPort = LocalNotifications,
): Promise<void> {
  await plugin.cancel({ notifications: [{ id: DIAGNOSTIC_NOTIFICATION_ID }] });
}

export async function getLocalNotificationDiagnostics(
  plugin: CapacitorLocalNotificationsPort = LocalNotifications,
): Promise<LocalNotificationDiagnostics> {
  const [permission, exactAlarm, pending, delivered] = await Promise.all([
    plugin.checkPermissions(),
    plugin.checkExactNotificationSetting(),
    plugin.getPending(),
    plugin.getDeliveredNotifications(),
  ]);

  return {
    displayPermission: permissionState(permission),
    exactAlarmPermission:
      exactAlarm.exact_alarm === "granted"
        ? "granted"
        : exactAlarm.exact_alarm === "denied"
          ? "denied"
          : "prompt",
    pendingTotal: pending.notifications.length,
    pendingTasks: pending.notifications.filter((notification) =>
      isOwnedExtra(notification.extra),
    ).length,
    pendingDiagnostic: pending.notifications.some(
      (notification) => notification.id === DIAGNOSTIC_NOTIFICATION_ID,
    ),
    deliveredTotal: delivered.notifications.length,
    deliveredDiagnostic: delivered.notifications.some(
      (notification) => notification.id === DIAGNOSTIC_NOTIFICATION_ID,
    ),
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
  if (
    !isOwnedExtra(notification.extra) &&
    !isDiagnosticExtra(notification.extra)
  ) {
    return null;
  }
  const { deepLink } = notification.extra;
  return deepLink.startsWith("/") && !deepLink.startsWith("//")
    ? deepLink
    : null;
}
