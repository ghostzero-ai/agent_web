"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  deletePushSubscription,
  enableWebPush,
  getPushState,
  removeCurrentWebPushSubscription,
  supportsWebPush,
  updateNotificationPreferences,
  type NotificationPreferences,
  type PushPublicState,
} from "@/lib/api/pushClient";

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "通知设置操作失败，请稍后重试。";
}

export function NotificationSettings() {
  const [state, setState] = useState<PushPublicState | null>(null);
  const [form, setForm] = useState<NotificationPreferences | null>(null);
  const [currentSubscriptionId, setCurrentSubscriptionId] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const loaded = await getPushState();
    setState(loaded);
    setForm(loaded.preferences);
    return loaded;
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve(supportsWebPush()).then((isSupported) => {
      if (active) setSupported(isSupported);
    });
    void getPushState()
      .then((loaded) => {
        if (!active) return;
        setState(loaded);
        setForm(loaded.preferences);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      });
    return () => {
      active = false;
    };
  }, []);

  const enable = async () => {
    if (!state || !form) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const enabled = await enableWebPush(state.publicKey);
      setCurrentSubscriptionId(enabled.serverSubscription.id);
      await updateNotificationPreferences({
        pushEnabled: true,
        quietHoursEnabled: form.quietHoursEnabled,
        quietStart: form.quietStart,
        quietEnd: form.quietEnd,
        expectedVersion: form.version,
      });
      await reload();
      setNotice("此设备已启用系统通知。下一条到期提醒会通过 Push 发送。");
    } catch (enableError) {
      setError(friendlyError(enableError));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const savePreferences = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateNotificationPreferences({
        pushEnabled: form.pushEnabled,
        quietHoursEnabled: form.quietHoursEnabled,
        quietStart: form.quietStart,
        quietEnd: form.quietEnd,
        expectedVersion: form.version,
      });
      setForm(updated);
      setState((current) => current ? { ...current, preferences: updated } : current);
      setNotice("通知偏好已保存。安静时段只延迟 Push，不影响收件箱记录。");
    } catch (saveError) {
      setError(friendlyError(saveError));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (id: string) => {
    if (!window.confirm("确定移除此设备的 Push 订阅吗？")) return;
    setBusy(true);
    setError(null);
    try {
      if (id === currentSubscriptionId) {
        await removeCurrentWebPushSubscription(id);
        setCurrentSubscriptionId(null);
      } else {
        await deletePushSubscription(id);
      }
      await reload();
      setNotice("设备订阅已移除。其他设备不受影响。");
    } catch (removeError) {
      setError(friendlyError(removeError));
    } finally {
      setBusy(false);
    }
  };

  if (!state || !form) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        {error ?? "正在读取通知设置…"}
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Delivery</p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">系统通知</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Inbox 始终保存提醒；Push 只是额外通知渠道，发送失败不会丢失提醒。
        </p>

        {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {notice && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}

        <div className="mt-5 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {form.pushEnabled ? "Push 已全局启用" : "Push 当前已暂停"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {supported === false
                  ? "此环境不支持 Push；请确认 HTTPS，iPhone/iPad 请先添加到主屏幕。"
                  : "授权必须由你点击按钮触发，应用不会自动弹出系统权限框。"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy || supported === false}
              onClick={() => void enable()}
              className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
            >
              {busy ? "处理中…" : "在此设备启用"}
            </button>
          </div>
        </div>

        <form className="mt-6 space-y-5" onSubmit={savePreferences}>
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">允许发送 Push</span>
              <span className="mt-1 block text-xs text-zinc-500">关闭后保留设备订阅和 Inbox，只暂停所有推送。</span>
            </span>
            <input
              type="checkbox"
              checked={form.pushEnabled}
              onChange={(event) => setForm({ ...form, pushEnabled: event.target.checked })}
              className="mt-1 size-5"
            />
          </label>

          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">启用安静时段</span>
              <span className="mt-1 block text-xs text-zinc-500">期间产生的提醒会延迟到结束时间发送。</span>
            </span>
            <input
              type="checkbox"
              checked={form.quietHoursEnabled}
              onChange={(event) => setForm({ ...form, quietHoursEnabled: event.target.checked })}
              className="mt-1 size-5"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              开始
              <input aria-label="安静时段开始" type="time" required disabled={!form.quietHoursEnabled} value={form.quietStart} onChange={(event) => setForm({ ...form, quietStart: event.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 disabled:opacity-50 dark:border-zinc-700" />
            </label>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              结束
              <input aria-label="安静时段结束" type="time" required disabled={!form.quietHoursEnabled} value={form.quietEnd} onChange={(event) => setForm({ ...form, quietEnd: event.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 disabled:opacity-50 dark:border-zinc-700" />
            </label>
          </div>
          <p className="text-xs text-zinc-500">时区固定为 Asia/Shanghai（北京时间）。开始与结束不能相同。</p>
          <button type="submit" disabled={busy} className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
            {busy ? "保存中…" : "保存通知偏好"}
          </button>
        </form>
      </section>

      <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">已登记设备</h2>
        <p className="mt-1 text-xs text-zinc-500">Endpoint 与浏览器密钥已加密，不会在这里回显。</p>
        {state.subscriptions.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">还没有设备订阅。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {state.subscriptions.map((subscription) => (
              <article key={subscription.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{subscription.deviceLabel}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${subscription.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{subscription.status === "active" ? "有效" : "已失效"}</span>
                </div>
                <button type="button" disabled={busy} onClick={() => void removeDevice(subscription.id)} className="mt-3 text-xs text-red-600 underline underline-offset-2 disabled:opacity-50 dark:text-red-400">移除此设备</button>
              </article>
            ))}
          </div>
        )}
        <div className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          iPhone/iPad：先在 Safari 中“添加到主屏幕”，再从主屏幕打开本应用并点击启用。
        </div>
      </aside>
    </div>
  );
}
