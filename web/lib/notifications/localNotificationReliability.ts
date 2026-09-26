import { Preferences } from "@capacitor/preferences";
import { listTasks, type TaskRecord } from "@/lib/api/taskClient";
import {
  localRemindersFromTasks,
  reconcileLocalTaskNotifications,
} from "@/lib/notifications/localTaskNotifications";
import type {
  LocalNotificationAdapter,
  LocalNotificationSyncResult,
  LocalReminderSnapshot,
} from "@/lib/platform/capabilities";

const CACHE_KEY = "local-task-reminders-v1";
const CACHE_VERSION = 1;
const MAX_CACHED_REMINDERS = 256;

type PreferencesPort = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

export type LocalReminderCacheRecord = {
  savedAt: string;
  reminders: LocalReminderSnapshot[];
};

export type LocalNotificationReliabilityResult = LocalNotificationSyncResult & {
  source: "server" | "device-cache";
  cacheSavedAt: string;
};

export type LocalReminderCache = {
  read(): Promise<LocalReminderCacheRecord | null>;
  write(reminders: readonly LocalReminderSnapshot[]): Promise<string>;
};

function isSafeText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isReminder(value: unknown): value is LocalReminderSnapshot {
  if (!value || typeof value !== "object") return false;
  const reminder = value as Record<string, unknown>;
  if (
    !isSafeText(reminder.taskId, 128) ||
    !isSafeText(reminder.occurrenceId, 512) ||
    !isSafeText(reminder.title, 200) ||
    !(reminder.body === null || isSafeText(reminder.body, 500)) ||
    !isSafeText(reminder.scheduledAt, 64) ||
    Number.isNaN(new Date(reminder.scheduledAt).getTime()) ||
    !isSafeText(reminder.deepLink, 1_024) ||
    !reminder.deepLink.startsWith("/") ||
    reminder.deepLink.startsWith("//")
  ) {
    return false;
  }

  if (reminder.recurrence === undefined) return true;
  if (!reminder.recurrence || typeof reminder.recurrence !== "object") return false;
  const recurrence = reminder.recurrence as Record<string, unknown>;
  const validTime =
    Number.isInteger(recurrence.hour) &&
    Number(recurrence.hour) >= 0 &&
    Number(recurrence.hour) <= 23 &&
    Number.isInteger(recurrence.minute) &&
    Number(recurrence.minute) >= 0 &&
    Number(recurrence.minute) <= 59;
  if (!validTime) return false;
  if (recurrence.type === "daily") return true;
  return (
    recurrence.type === "weekly" &&
    Number.isInteger(recurrence.weekday) &&
    Number(recurrence.weekday) >= 1 &&
    Number(recurrence.weekday) <= 7
  );
}

function parseCache(value: string): LocalReminderCacheRecord | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.savedAt !== "string" ||
      Number.isNaN(new Date(parsed.savedAt).getTime()) ||
      !Array.isArray(parsed.reminders) ||
      parsed.reminders.length > MAX_CACHED_REMINDERS ||
      !parsed.reminders.every(isReminder)
    ) {
      return null;
    }
    return {
      savedAt: parsed.savedAt,
      reminders: parsed.reminders.map((reminder) => ({ ...reminder })),
    };
  } catch {
    return null;
  }
}

export function createLocalReminderCache(
  preferences: PreferencesPort = Preferences,
): LocalReminderCache {
  return {
    async read() {
      const { value } = await preferences.get({ key: CACHE_KEY });
      if (value === null) return null;
      const cached = parseCache(value);
      if (cached) return cached;
      await preferences.remove({ key: CACHE_KEY });
      return null;
    },

    async write(reminders) {
      if (reminders.length > MAX_CACHED_REMINDERS) {
        throw new Error(`本地提醒数量不能超过 ${MAX_CACHED_REMINDERS} 项`);
      }
      if (!reminders.every(isReminder)) {
        throw new Error("本地提醒缓存包含无效数据");
      }
      const savedAt = new Date().toISOString();
      await preferences.set({
        key: CACHE_KEY,
        value: JSON.stringify({
          version: CACHE_VERSION,
          savedAt,
          reminders,
        }),
      });
      return savedAt;
    },
  };
}

export async function reconcileAndCacheLocalTaskNotifications(
  adapter: LocalNotificationAdapter,
  tasks: readonly TaskRecord[],
  cache: LocalReminderCache = createLocalReminderCache(),
): Promise<LocalNotificationReliabilityResult> {
  const reminders = localRemindersFromTasks(tasks);
  const result = await reconcileLocalTaskNotifications(adapter, tasks);
  const cacheSavedAt = await cache.write(reminders);
  return { ...result, source: "server", cacheSavedAt };
}

export async function reconcileLocalTaskNotificationsWithFallback(
  adapter: LocalNotificationAdapter,
  loadTasks: () => Promise<TaskRecord[]> = listTasks,
  cache: LocalReminderCache = createLocalReminderCache(),
): Promise<LocalNotificationReliabilityResult> {
  let tasks: TaskRecord[];
  try {
    tasks = await loadTasks();
  } catch (serverError) {
    const cached = await cache.read();
    if (!cached) throw serverError;
    const result = await adapter.reconcile(cached.reminders);
    return {
      ...result,
      source: "device-cache",
      cacheSavedAt: cached.savedAt,
      warning:
        result.warning ??
        "服务端当前不可用，已使用设备中最近一次同步的提醒快照。",
    };
  }

  return reconcileAndCacheLocalTaskNotifications(adapter, tasks, cache);
}
