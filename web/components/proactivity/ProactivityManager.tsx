"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  evaluateProactivityNow,
  getProactivityDashboard,
  updateProactivityPreferences,
  type ProactivityDashboard,
  type ProactivityEvaluation,
  type ProactivityPreferences,
  type ProactivityReason,
} from "@/lib/api/proactivityClient";
import { appHref } from "@/lib/platform/appNavigation";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

type FormState = Pick<
  ProactivityPreferences,
  | "enabled"
  | "maxMessagesPerDay"
  | "minCooldownHours"
  | "checkinAfterDays"
  | "allowedReasons"
  | "pausedUntil"
>;

const REASONS: Array<{
  value: ProactivityReason;
  title: string;
  description: string;
}> = [
  {
    value: "goal_followup",
    title: "跟进已确认目标",
    description: "只使用记忆页中由你确认、尚未过期且非敏感的目标。",
  },
  {
    value: "checkin",
    title: "久未互动时温和问候",
    description: "只依据最后一次真实用户消息的时间，不推断你的情绪或处境。",
  },
];

const SKIP_TEXT: Record<
  Extract<ProactivityEvaluation, { status: "skipped" }>["code"],
  string
> = {
  disabled: "主动问候当前关闭。",
  paused: "主动问候仍在暂停期。",
  quiet_hours: "当前处于通知安静时段，本次没有生成问候。",
  unread_pending: "上一条主动问候仍未读，本次不会继续打扰。",
  daily_budget: "今天的主动问候预算已经用完。",
  cooldown: "距离上一条主动问候还没有超过冷却时间。",
  no_signal: "目前没有符合条件且尚未使用的真实触发信号。",
};

function formFrom(dashboard: ProactivityDashboard): FormState {
  const { preferences } = dashboard;
  return {
    enabled: preferences.enabled,
    maxMessagesPerDay: preferences.maxMessagesPerDay,
    minCooldownHours: preferences.minCooldownHours,
    checkinAfterDays: preferences.checkinAfterDays,
    allowedReasons: preferences.allowedReasons,
    pausedUntil: preferences.pausedUntil,
  };
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProactivityManager() {
  const [renderedAt] = useState(Date.now);
  const [dashboard, setDashboard] = useState<ProactivityDashboard | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useNavigationGuard(busy || Boolean(dashboard && form && JSON.stringify(form) !== JSON.stringify(formFrom(dashboard))));

  const applyDashboard = (next: ProactivityDashboard) => {
    setDashboard(next);
    setForm(formFrom(next));
  };

  useEffect(() => {
    let active = true;
    void getProactivityDashboard()
      .then((loaded) => {
        if (active) applyDashboard(loaded);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = async (next: FormState, success: string) => {
    if (!dashboard) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateProactivityPreferences({
        ...next,
        expectedVersion: dashboard.preferences.version,
      });
      applyDashboard(updated);
      setNotice(success);
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form) await update(form, "主动问候设置已保存，后台 Worker 会按新规则执行。");
  };

  const pauseWeek = async () => {
    if (!form) return;
    await update(
      { ...form, pausedUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString() },
      "主动问候已暂停一周，任务提醒和定期内容不受影响。",
    );
  };

  const clearPause = async () => {
    if (form) await update({ ...form, pausedUntil: null }, "主动问候暂停已取消。");
  };

  const disableReason = async (reason: ProactivityReason) => {
    if (!form) return;
    await update(
      {
        ...form,
        allowedReasons: form.allowedReasons.filter((value) => value !== reason),
      },
      "这一类触发原因已关闭。",
    );
  };

  const evaluate = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await evaluateProactivityNow();
      setNotice(
        result.status === "created"
          ? "已按当前规则生成一条问候，请到收件箱查看；Push 是否送达取决于设备与通知设置。"
          : SKIP_TEXT[result.code],
      );
      applyDashboard(await getProactivityDashboard());
    } catch (evaluationError) {
      setError(friendlyError(evaluationError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取主动问候设置…</p>;
  }
  if (!dashboard || !form) {
    return <div role="alert" className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error ?? "无法读取主动问候设置。"}</div>;
  }

  const paused = Boolean(
    form.pausedUntil && new Date(form.pausedUntil).getTime() > renderedAt,
  );

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Proactivity policy</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">让主动联系保持克制</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">默认关闭。开启后，服务端只有在存在真实触发原因并通过安静时段、预算、冷却和未读检查时，才会把问候写入 Inbox。</p>
        </div>

        <label className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <span>
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">允许主动问候</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">不影响你明确创建的任务、新闻、书单和普通提醒。</span>
          </span>
          <input aria-label="允许主动问候" type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="mt-1 size-5" />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">允许的真实触发原因</legend>
          {REASONS.map((reason) => (
            <label key={reason.value} className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <input
                type="checkbox"
                checked={form.allowedReasons.includes(reason.value)}
                onChange={(event) => setForm({
                  ...form,
                  allowedReasons: event.target.checked
                    ? [...new Set([...form.allowedReasons, reason.value])]
                    : form.allowedReasons.filter((value) => value !== reason.value),
                })}
                className="mt-1 size-5"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{reason.title}</span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">{reason.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            每日最多
            <select aria-label="每日最多主动问候" value={form.maxMessagesPerDay} onChange={(event) => setForm({ ...form, maxMessagesPerDay: Number(event.target.value) })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value={1}>1 条（推荐）</option><option value={2}>2 条</option><option value={3}>3 条</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            最短冷却
            <select aria-label="主动问候冷却时间" value={form.minCooldownHours} onChange={(event) => setForm({ ...form, minCooldownHours: Number(event.target.value) })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value={24}>24 小时</option><option value={48}>48 小时</option><option value={72}>72 小时（推荐）</option><option value={168}>一周</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            未互动多久后问候
            <select aria-label="未互动问候天数" value={form.checkinAfterDays} onChange={(event) => setForm({ ...form, checkinAfterDays: Number(event.target.value) })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              {[1, 2, 3, 5, 7, 14, 30].map((days) => <option key={days} value={days}>{days} 天</option>)}
            </select>
          </label>
        </div>

        <div className="rounded-xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          <p>沿用通知安静时段：{dashboard.quietHours.enabled ? `${dashboard.quietHours.start}–${dashboard.quietHours.end}` : "未启用"}（北京时间）。安静期间不会生成主动问候。</p>
          <a href={appHref("/notifications")} className="mt-1 inline-block text-blue-600 underline underline-offset-2 dark:text-blue-400">调整通知与安静时段</a>
          {paused && <p className="mt-2 font-medium text-amber-700 dark:text-amber-300">已暂停至 {timeLabel(form.pausedUntil!)}</p>}
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">{busy ? "处理中…" : "保存主动问候设置"}</button>
          <button type="button" disabled={busy} onClick={() => void evaluate()} className="rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-medium text-blue-700 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300">按已保存规则检查一次</button>
          {paused ? (
            <button type="button" disabled={busy} onClick={() => void clearPause()} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm disabled:opacity-50 dark:border-zinc-700">取消暂停</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void pauseWeek()} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm disabled:opacity-50 dark:border-zinc-700">暂停一周</button>
          )}
        </div>
      </form>

      <aside className="h-fit space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm leading-6 text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
        <div>
          <h2 className="font-semibold">最近为什么联系你</h2>
          <p className="mt-1 text-xs opacity-75">Ledger 只记录已真正创建的问候和当时规则，不复制目标正文。</p>
        </div>
        {dashboard.recentContacts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-violet-300 p-3 text-xs dark:border-violet-800">还没有主动问候记录。</p>
        ) : dashboard.recentContacts.map((contact) => (
          <article key={contact.id} className="rounded-xl border border-violet-200 bg-white/70 p-3 dark:border-violet-800 dark:bg-violet-950/40">
            <p className="text-xs font-medium">{contact.reason === "goal_followup" ? "目标跟进" : "久未互动问候"} · {timeLabel(contact.createdAt)}</p>
            <p className="mt-1 text-xs opacity-80">{contact.rationale}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {contact.inboxItemId && <a href={appHref(`/inbox?highlight=${contact.inboxItemId}`)} className="text-xs underline underline-offset-2">查看消息</a>}
              <button type="button" disabled={busy || !form.allowedReasons.includes(contact.reason)} onClick={() => void disableReason(contact.reason)} className="text-xs underline underline-offset-2 disabled:opacity-40">不要再因此联系</button>
            </div>
          </article>
        ))}
        <p className="text-xs opacity-75">系统不会使用“你为什么不理我”等负罪感表达，也不会把沉默解释为负面情绪。</p>
      </aside>
    </div>
  );
}
