"use client";

import { useEffect, useState } from "react";
import { listTasks } from "@/lib/api/taskClient";
import { reconcileLocalTaskNotifications } from "@/lib/notifications/localTaskNotifications";
import type { LocalNotificationAdapter } from "@/lib/platform/capabilities";
import { getCapacitorLocalNotificationAdapter } from "@/lib/platform/capacitorLocalNotifications";

type NativeState =
  | { kind: "unsupported" | "checking" | "prompt" | "denied" }
  | { kind: "granted"; pending: number; warning?: string }
  | { kind: "error"; message: string };

async function readNativeState(
  adapter: LocalNotificationAdapter,
  requestPermission: boolean,
): Promise<NativeState> {
  const permission = requestPermission
    ? await adapter.requestPermission()
    : await adapter.checkPermission();
  if (permission !== "granted") return { kind: permission };
  const tasks = await listTasks();
  const result = await reconcileLocalTaskNotifications(adapter, tasks);
  return {
    kind: "granted",
    pending: result.pending,
    warning: result.warning,
  };
}

export function NativeTaskNotificationSettings() {
  const [state, setState] = useState<NativeState>({ kind: "unsupported" });

  useEffect(() => {
    const adapter = getCapacitorLocalNotificationAdapter();
    if (!adapter) return;
    let active = true;
    void readNativeState(adapter, false)
      .then((next) => {
        if (active) setState(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "本地提醒同步失败",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.kind === "unsupported") return null;

  const enable = async () => {
    const adapter = getCapacitorLocalNotificationAdapter();
    if (!adapter) return;
    setState({ kind: "checking" });
    try {
      setState(await readNativeState(adapter, true));
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "本地提醒同步失败",
      });
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6 dark:border-blue-900 dark:bg-blue-950/30">
      <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
        Android APK
      </p>
      <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            本地任务提醒
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            由手机系统直接调度，不依赖浏览器 Web Push；服务端离线时，已经同步的任务仍可弹窗。
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {state.kind === "granted"
              ? `权限已开启，已同步 ${state.pending} 项活动任务。`
              : state.kind === "denied"
                ? "权限已被拒绝，请先在系统应用设置中允许通知。"
                : state.kind === "error"
                  ? `同步失败：${state.message}`
                  : state.kind === "checking"
                    ? "正在检查并同步…"
                    : "点击按钮后才会请求系统通知权限。"}
          </p>
          {state.kind === "granted" && state.warning && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              {state.warning}
            </p>
          )}
        </div>
        {state.kind !== "granted" && (
          <button
            type="button"
            disabled={state.kind === "checking"}
            onClick={() => void enable()}
            className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {state.kind === "checking" ? "处理中…" : state.kind === "denied" ? "重新检查" : "开启本地提醒"}
          </button>
        )}
      </div>
    </section>
  );
}
