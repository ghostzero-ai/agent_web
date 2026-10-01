"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/clientRuntime";
import type { ModelUsageOverview } from "@/lib/api/modelUsageApi";

const labels: Record<string, string> = { chat: "聊天", "agent-task": "AI 任务", news: "新闻", books: "书籍", reflection: "反思", memorization: "背诵评分", "problem-solving": "解题", "review-card": "复习卡", game: "娱乐", "context-summary": "上下文摘要" };
const tokens = (value: number | null) => value === null ? "未知" : value.toLocaleString();

export function ModelUsagePanel() {
  const [data, setData] = useState<ModelUsageOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/v1/model/usage", { cache: "no-store" });
      if (!response.ok) throw new Error("暂时无法读取模型用量，请检查服务端连接。");
      const result = await response.json() as { data: ModelUsageOverview };
      setData(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取失败。");
    } finally { setLoading(false); }
  }
  return (
    <section aria-label="Token 与费用" className="space-y-3 border-t border-zinc-200 pt-5 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Token 与费用（最近 7 天）</h2>
        <button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-lg border border-zinc-300 px-3 py-2 disabled:opacity-50 dark:border-zinc-700">{loading ? "读取中…" : "查看/刷新用量"}</button>
      </div>
      <p className="text-xs leading-5 text-zinc-500">仅读取服务端记录，不调用模型。缺少 usage、缓存字段或价格时显示未知；费用是估算，不是账单。记录从本版本启用后开始。</p>
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p>已记录 {data.recordedCalls} 次调用。{data.truncated ? "仅显示最近 5000 次，不是完整七天总计。" : ""}</p>
        {data.groups.length === 0 && <p className="text-zinc-500">暂无记录，正常使用后可回来查看。</p>}
        {data.groups.map((group) => <div key={`${group.providerOrigin}/${group.model}/${group.business}`} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="break-all font-medium">{labels[group.business] ?? group.business} · {group.model}</p>
          <p className="break-all text-xs text-zinc-500">{group.providerOrigin}</p>
          <p>调用 {group.calls} · 请求尝试 {group.attempts} · 失败 {group.failures} · 取消 {group.cancelled}</p>
          <p>已知输入 {tokens(group.inputTokens)} · 输出 {tokens(group.outputTokens)}</p>
          <p>缓存命中 {tokens(group.cachedInputTokens)} · 命中率 {group.cacheHitRate === null ? "未知" : `${(group.cacheHitRate * 100).toFixed(1)}%`}</p>
          <p className="text-xs text-zinc-500">输入用量覆盖 {group.usageKnown}/{group.calls}；缓存覆盖 {group.cacheKnown}/{group.calls}；计价覆盖 {group.pricedCalls}/{group.calls}。统计仅包含已知值。</p>
          <p>已知估算费用：{Object.entries(group.costs).map(([currency, value]) => `${currency} ${value.toFixed(6)}`).join("；") || "未知（未配置对应价格或缺少用量）"}</p>
        </div>)}
      </>}
    </section>
  );
}
