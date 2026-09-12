"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteInboxItem,
  listInboxItems,
  updateInboxStatus,
  type InboxFilter,
  type InboxItem,
} from "@/lib/api/inboxClient";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
  { value: "read", label: "已读" },
];

export function inboxTimeLabel(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export function InboxManager() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (nextFilter: InboxFilter) => {
    try {
      setItems(await listInboxItems(nextFilter));
      setError(null);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listInboxItems(filter)
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const interval = window.setInterval(() => void reload(filter), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [filter, reload]);

  const changeStatus = async (item: InboxItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateInboxStatus(item.id, item.status === "read" ? "unread" : "read");
      await reload(filter);
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: InboxItem) => {
    if (!window.confirm(`确定删除“${item.title}”吗？`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      await deleteInboxItem(item.id);
      await reload(filter);
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusyId(null);
    }
  };

  const unreadCount = items.filter((item) => item.status === "unread").length;

  return (
    <section className="mx-auto w-full max-w-4xl" aria-label="提醒收件箱">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Inbox</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            提醒消息
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {filter === "all" ? `${unreadCount} 条未读` : `${items.length} 条记录`}
          </p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto" role="group" aria-label="筛选提醒">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => {
                if (option.value !== filter) setLoading(true);
                setFilter(option.value);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
                filter === option.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void reload(filter)}
            className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          正在读取提醒…
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-zinc-950/60">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">这里暂时没有提醒</p>
          <p className="mt-1 text-sm text-zinc-500">任务到达设定时间后，会自动出现在这里。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-950 ${
                item.status === "unread"
                  ? "border-blue-200 dark:border-blue-900"
                  : "border-zinc-200 opacity-80 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-label={item.status === "unread" ? "未读" : "已读"}
                  className={`mt-2 size-2 shrink-0 rounded-full ${item.status === "unread" ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="break-words font-semibold text-zinc-950 dark:text-zinc-50">
                      {item.title}
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {item.source === "agent_prompt" ? "AI 定时任务" : "普通提醒"}
                    </span>
                    <time className="shrink-0 text-xs text-zinc-500" dateTime={item.occurredAt}>
                      {inboxTimeLabel(item.occurredAt)}
                    </time>
                  </div>
                  {item.body && (
                    <div className="mt-2 break-words text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      <MarkdownMessage content={item.body} />
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void changeStatus(item)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      标为{item.status === "read" ? "未读" : "已读"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void remove(item)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
