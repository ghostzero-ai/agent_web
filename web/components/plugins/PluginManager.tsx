"use client";

import { useEffect, useState } from "react";
import {
  getPluginCapabilities,
  listPlugins,
  listPluginCapabilityAudit,
  setPluginCapabilityGrant,
  setPluginEnabled,
  type PluginCapabilityAuditItem,
  type PluginCapabilityDashboard,
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
  if (plugin.installation.enabled) return "已启用";
  return "未启用";
}

export function PluginManager() {
  const [plugins, setPlugins] = useState<PluginCatalogItem[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, PluginCapabilityDashboard>>({});
  const [audits, setAudits] = useState<Record<string, PluginCapabilityAuditItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listPlugins()
      .then(async (items) => {
        const details = await Promise.all(items.map(async (plugin) => {
          const [dashboard, audit] = await Promise.all([
            getPluginCapabilities(plugin.manifest.id),
            listPluginCapabilityAudit(plugin.manifest.id, 5),
          ]);
          return { id: plugin.manifest.id, dashboard, audit };
        }));
        if (active) {
          setPlugins(items);
          setCapabilities(Object.fromEntries(
            details.map((detail) => [detail.id, detail.dashboard]),
          ));
          setAudits(Object.fromEntries(
            details.map((detail) => [detail.id, detail.audit]),
          ));
        }
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

  const refreshCapabilityState = async (pluginId: string) => {
    const [dashboard, audit] = await Promise.all([
      getPluginCapabilities(pluginId),
      listPluginCapabilityAudit(pluginId, 5),
    ]);
    setCapabilities((current) => ({ ...current, [pluginId]: dashboard }));
    setAudits((current) => ({ ...current, [pluginId]: audit }));
  };

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
      await refreshCapabilityState(plugin.manifest.id);
      setNotice(
        enabled
          ? `${updated.manifest.name}已启用；请逐项审核它申请的能力。`
          : `${updated.manifest.name}已禁用，核心聊天、任务和历史数据不受影响。`,
      );
    } catch (stateError) {
      setError(friendlyError(stateError));
    } finally {
      setBusyId(null);
    }
  };

  const changeCapabilityGrant = async (
    plugin: PluginCatalogItem,
    dashboard: PluginCapabilityDashboard,
    capabilityId: PluginCapabilityDashboard["capabilities"][number]["id"],
  ) => {
    const capability = dashboard.capabilities.find((item) => item.id === capabilityId);
    if (!capability) return;
    const granted = capability.grant.status !== "granted";
    const busyKey = `${plugin.manifest.id}:${capabilityId}`;
    setBusyId(busyKey);
    setNotice(null);
    setError(null);
    try {
      const updated = await setPluginCapabilityGrant(
        plugin.manifest.id,
        capabilityId,
        granted,
        capability.grant.version,
      );
      setCapabilities((current) => ({
        ...current,
        [plugin.manifest.id]: updated,
      }));
      const audit = await listPluginCapabilityAudit(plugin.manifest.id, 5);
      setAudits((current) => ({ ...current, [plugin.manifest.id]: audit }));
      setNotice(
        `${capability.name}已${granted ? "授权" : "撤销"}。${granted ? "调用仍受每日配额和审计约束。" : "插件后续调用会被网关拒绝。"}`,
      );
    } catch (grantError) {
      setError(friendlyError(grantError));
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
        <h2 className="font-semibold">Phase 7.2 受控能力边界</h2>
        <p className="mt-1">
          启用插件后仍需逐项授权。每次调用都会检查插件版本、授权和每日配额，并留下不含 Prompt、学习正文或 API Key 的元数据审计记录。
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
          const dashboard = capabilities[plugin.manifest.id];
          const pluginAudit = audits[plugin.manifest.id] ?? [];
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
                <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">能力授权与每日配额</h3>
                <div className="mt-2 space-y-2">
                  {(dashboard?.capabilities ?? []).map((capability) => {
                    const capabilityBusy = busyId === `${plugin.manifest.id}:${capability.id}`;
                    return (
                      <div key={capability.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{capability.name}</p>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">{capability.description}</p>
                            <p className={`mt-1 text-[11px] ${capability.adapterStatus === "available" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"}`}>
                              {capability.adapterStatus === "available" ? "宿主 Adapter 已接入" : "已预留，随学习活动接入"}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={
                              capabilityBusy ||
                              (!dashboard.pluginEnabled && capability.grant.status !== "granted")
                            }
                            onClick={() => void changeCapabilityGrant(plugin, dashboard, capability.id)}
                            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45 ${capability.grant.status === "granted" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-blue-600 text-white"}`}
                          >
                            {capabilityBusy
                              ? "处理中…"
                              : capability.grant.status === "granted"
                                ? "撤销"
                                : capability.grant.requiresReview
                                  ? "重新审核"
                                  : "授权"}
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] text-zinc-500">
                          今日 {capability.quota.used}/{capability.quota.limit} 次
                          {capability.grant.effective
                            ? " · 已生效"
                            : capability.grant.status === "granted"
                              ? " · 已授权但当前停用"
                              : " · 未授权"}
                        </p>
                      </div>
                    );
                  })}
                  {!dashboard && (
                    <p className="text-xs text-zinc-500">{plugin.manifest.requestedCapabilities.map((capability) => CAPABILITY_LABELS[capability] ?? capability).join("、")}</p>
                  )}
                </div>
                {!plugin.installation.enabled && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">先启用插件，才能逐项审核能力。启用本身不会自动授权。</p>
                )}
              </div>

              <details className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-200">最近能力审计（{pluginAudit.length}）</summary>
                <div className="mt-2 space-y-2 text-zinc-500">
                  {pluginAudit.length === 0 && <p>尚无授权变更或能力调用。</p>}
                  {pluginAudit.map((item) => (
                    <p key={item.id}>
                      {item.operation} · {item.outcome} · {new Date(item.createdAt).toLocaleString("zh-CN")}
                      {item.errorCode ? ` · ${item.errorCode}` : ""}
                    </p>
                  ))}
                </div>
              </details>

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
                        ? "禁用插件"
                        : "启用插件"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
