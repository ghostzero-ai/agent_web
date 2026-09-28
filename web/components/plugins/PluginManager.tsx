"use client";

import { useEffect, useState } from "react";
import {
  listPlugins,
  setPluginEnabled,
  type PluginCatalogItem,
} from "@/lib/api/pluginClient";

const CAPABILITY_LABELS: Record<string, string> = {
  "model.generate": "请求受控模型生成",
  "storage.read-write": "使用插件隔离存储",
  "task.create-draft": "提交任务草稿",
};

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function statusLabel(plugin: PluginCatalogItem): string {
  if (plugin.compatibility.status === "incompatible") return "版本不兼容";
  if (plugin.installation.enabled) return "已启用插件基础";
  return "未启用";
}

export function PluginManager() {
  const [plugins, setPlugins] = useState<PluginCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listPlugins()
      .then((items) => {
        if (active) setPlugins(items);
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

  const changeState = async (plugin: PluginCatalogItem) => {
    const enabled = !plugin.installation.enabled;
    setBusyId(plugin.manifest.id);
    setNotice(null);
    setError(null);
    try {
      const updated = await setPluginEnabled(
        plugin.manifest.id,
        enabled,
        plugin.installation.version,
      );
      setPlugins((current) =>
        current.map((item) =>
          item.manifest.id === updated.manifest.id ? updated : item,
        ),
      );
      setNotice(
        enabled
          ? `${updated.manifest.name}的插件基础已启用；活动功能仍按后续阶段开发。`
          : `${updated.manifest.name}已禁用，核心聊天、任务和历史数据不受影响。`,
      );
    } catch (stateError) {
      setError(friendlyError(stateError));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        正在读取第一方插件…
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <h2 className="font-semibold">Phase 7.1 插件边界</h2>
        <p className="mt-1">
          当前只发现随应用发布的第一方 Manifest。启用只保存你的选择，不会执行任意外部代码，也不会授予模型、数据库、网络、任务或通知权限。
        </p>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {plugins.map((plugin) => {
          const incompatible = plugin.compatibility.status === "incompatible";
          const busy = busyId === plugin.manifest.id;
          return (
            <article key={plugin.manifest.id} className="flex min-h-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">First-party activity</p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{plugin.manifest.name}</h2>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${incompatible ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : plugin.installation.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"}`}>
                  {statusLabel(plugin)}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{plugin.manifest.description}</p>

              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                <div><dt className="text-zinc-500">插件版本</dt><dd className="mt-1 font-medium">{plugin.manifest.version}</dd></div>
                <div><dt className="text-zinc-500">API 范围</dt><dd className="mt-1 font-medium">{plugin.manifest.pluginApiVersion}</dd></div>
                <div><dt className="text-zinc-500">Manifest</dt><dd className="mt-1 font-medium">v{plugin.manifest.schemaVersion}</dd></div>
                <div><dt className="text-zinc-500">来源</dt><dd className="mt-1 font-medium">随应用发布</dd></div>
              </dl>

              <div className="mt-4">
                <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">声明的未来能力</h3>
                <ul className="mt-2 space-y-1.5 text-xs text-zinc-500">
                  {plugin.manifest.requestedCapabilities.map((capability) => (
                    <li key={capability}>• {CAPABILITY_LABELS[capability] ?? capability}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">声明不等于授权；Phase 7.2 接入 Capability Gateway 前，这些能力均不可调用。</p>
              </div>

              {incompatible && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {plugin.compatibility.reason}
                </p>
              )}

              <div className="mt-auto pt-5">
                <button
                  type="button"
                  disabled={busy || incompatible}
                  onClick={() => void changeState(plugin)}
                  className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 dark:bg-zinc-100 dark:text-zinc-950"
                >
                  {busy
                    ? "处理中…"
                    : incompatible
                      ? "无法启用"
                      : plugin.installation.enabled
                        ? "禁用插件基础"
                        : "启用插件基础"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
