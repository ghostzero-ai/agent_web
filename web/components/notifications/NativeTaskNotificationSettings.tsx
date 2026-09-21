"use client";

import { useEffect, useState } from "react";
import { listTasks } from "@/lib/api/taskClient";
import { reconcileLocalTaskNotifications } from "@/lib/notifications/localTaskNotifications";
import type { LocalNotificationAdapter } from "@/lib/platform/capabilities";
import {
  cancelDiagnosticNotification,
  getCapacitorLocalNotificationAdapter,
  getLocalNotificationDiagnostics,
  scheduleDiagnosticNotification,
  type LocalNotificationDiagnostics,
} from "@/lib/platform/capacitorLocalNotifications";

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
  const [diagnostics, setDiagnostics] = useState<LocalNotificationDiagnostics | null>(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);

  const refreshDiagnostics = async () => {
    setDiagnostics(await getLocalNotificationDiagnostics());
  };

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
    void getLocalNotificationDiagnostics()
      .then((nextDiagnostics) => {
        if (active) setDiagnostics(nextDiagnostics);
      })
      .catch((error: unknown) => {
        if (active) {
          setDiagnosticMessage(
            error instanceof Error ? `诊断读取失败：${error.message}` : "诊断读取失败",
          );
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

  const runDiagnostic = async () => {
    setDiagnosticBusy(true);
    setDiagnosticMessage(null);
    try {
      const result = await scheduleDiagnosticNotification();
      await refreshDiagnostics();
      const time = new Date(result.scheduledAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setDiagnosticMessage(
        `测试通知已安排在 ${time}。现在可立即切到后台、划掉应用或使用系统清理进行对比。${
          result.warning ? ` 系统提示：${result.warning}` : ""
        }`,
      );
    } catch (error) {
      setDiagnosticMessage(
        error instanceof Error ? `测试失败：${error.message}` : "测试通知安排失败",
      );
    } finally {
      setDiagnosticBusy(false);
    }
  };

  const cancelDiagnostic = async () => {
    setDiagnosticBusy(true);
    setDiagnosticMessage(null);
    try {
      await cancelDiagnosticNotification();
      await refreshDiagnostics();
      setDiagnosticMessage("测试通知已取消。等待原定时间经过，可验证取消后不会弹出。");
    } catch (error) {
      setDiagnosticMessage(
        error instanceof Error ? `取消失败：${error.message}` : "取消测试通知失败",
      );
    } finally {
      setDiagnosticBusy(false);
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

      {state.kind === "granted" && (
        <details className="mt-5 border-t border-blue-200 pt-4 dark:border-blue-900">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200">
            通知诊断
          </summary>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            10 秒测试复用正式任务提醒的系统通道。重复测试会覆盖上一条测试，不会写入数据库。
          </p>

          {diagnostics && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <DiagnosticItem
                label="通知权限"
                value={diagnostics.displayPermission === "granted" ? "已允许" : "未允许"}
              />
              <DiagnosticItem
                label="精确闹钟"
                value={diagnostics.exactAlarmPermission === "granted" ? "已允许" : "未允许"}
              />
              <DiagnosticItem
                label="系统记录"
                value={`待发 ${diagnostics.pendingTotal}（任务 ${diagnostics.pendingTasks}）/ 已送达 ${diagnostics.deliveredTotal}`}
              />
              <DiagnosticItem
                label="测试状态"
                value={
                  diagnostics.deliveredDiagnostic
                    ? "已送达"
                    : diagnostics.pendingDiagnostic
                      ? "待发送"
                      : "无记录"
                }
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={diagnosticBusy}
              onClick={() => void runDiagnostic()}
              className="rounded-xl bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {diagnosticBusy ? "正在安排…" : "10 秒通知测试"}
            </button>
            <button
              type="button"
              disabled={diagnosticBusy || !diagnostics?.pendingDiagnostic}
              onClick={() => void cancelDiagnostic()}
              className="rounded-xl border border-amber-300 px-3.5 py-2 text-sm font-medium text-amber-700 disabled:opacity-50 dark:border-amber-800 dark:text-amber-300"
            >
              取消测试
            </button>
            <button
              type="button"
              disabled={diagnosticBusy}
              onClick={() => {
                setDiagnosticBusy(true);
                setDiagnosticMessage(null);
                void refreshDiagnostics()
                  .catch((error: unknown) => {
                    setDiagnosticMessage(
                      error instanceof Error ? `刷新失败：${error.message}` : "刷新诊断失败",
                    );
                  })
                  .finally(() => setDiagnosticBusy(false));
              }}
              className="rounded-xl border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
            >
              刷新状态
            </button>
          </div>
          {diagnosticMessage && (
            <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              {diagnosticMessage}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            建议依次测试：保持前台、切到后台、从最近任务划掉、华为系统清理。每次重新打开本页后点击“刷新状态”。
            “已送达”只统计仍留在通知栏中的通知，点击或清除后会显示“无记录”。
          </p>
        </details>
      )}
    </section>
  );
}

function DiagnosticItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/80 px-3 py-2 dark:bg-zinc-950/60">
      <p className="text-zinc-400">{label}</p>
      <p className="mt-1 font-medium text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}
