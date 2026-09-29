"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLink } from "@/components/platform/AppLink";
import {
  createMemorizationMaterial,
  deleteMemorizationMaterial,
  getMemorizationMaterial,
  listMemorizationMaterials,
  MemorizationClientError,
  reviewMemorizationUnit,
} from "@/lib/api/memorizationClient";
import { createTask, type TaskInput } from "@/lib/api/taskClient";
import {
  splitMemorizationText,
  type MemorizationMaterial,
  type MemorizationMaterialSummary,
  type MemorizationUnitInput,
} from "@/lib/memorization/domain";
import type {
  MemorizationReviewResult,
  MemorizationTaskDraft,
} from "@/lib/memorization/service";

function friendlyError(error: unknown): string {
  if (error instanceof MemorizationClientError) {
    if (["PLUGIN_DISABLED", "CAPABILITY_NOT_GRANTED", "PLUGIN_VERSION_REVIEW_REQUIRED"].includes(error.code)) {
      return "背书插件尚未启用，或隔离存储能力尚未授权。请先到插件页完成启用与授权。";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function dateLabel(value: string | null): string {
  if (!value) return "尚未安排";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function MemorizationActivity() {
  const [materials, setMaterials] = useState<MemorizationMaterialSummary[]>([]);
  const [active, setActive] = useState<MemorizationMaterial | null>(null);
  const [storageVersion, setStorageVersion] = useState(0);
  const [unitIndex, setUnitIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [draftUnits, setDraftUnits] = useState<MemorizationUnitInput[]>([]);
  const [recitation, setRecitation] = useState("");
  const [result, setResult] = useState<MemorizationReviewResult | null>(null);
  const [taskDraft, setTaskDraft] = useState<MemorizationTaskDraft | null>(null);
  const [taskCreated, setTaskCreated] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentUnit = active?.units[unitIndex] ?? null;
  const progress = useMemo(() => {
    if (!active) return null;
    return {
      reviewed: active.units.filter((unit) => unit.reviewCount > 0).length,
      total: active.units.length,
    };
  }, [active]);

  const reloadList = async () => {
    const items = await listMemorizationMaterials();
    setMaterials(items);
  };

  useEffect(() => {
    let mounted = true;
    void listMemorizationMaterials()
      .then((items) => {
        if (mounted) setMaterials(items);
      })
      .catch((loadError) => {
        if (mounted) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const prepareUnits = () => {
    setError(null);
    const units = splitMemorizationText(sourceText);
    if (!units.length) {
      setError("请先粘贴需要背诵的材料。");
      return;
    }
    setDraftUnits(units);
  };

  const saveMaterial = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await createMemorizationMaterial({ title, sourceText, units: draftUnits });
      setActive(saved.material);
      setStorageVersion(saved.storageVersion);
      setUnitIndex(0);
      setDraftUnits([]);
      setTitle("");
      setSourceText("");
      await reloadList();
      setNotice("材料已保存到插件隔离存储，可以开始复述。已保存的是你校对后的单元。" );
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const openMaterial = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const loaded = await getMemorizationMaterial(id);
      setActive(loaded.material);
      setStorageVersion(loaded.storageVersion);
      const dueIndex = loaded.material.units.findIndex((unit) =>
        !unit.nextReviewAt || new Date(unit.nextReviewAt).getTime() <= Date.now(),
      );
      setUnitIndex(dueIndex >= 0 ? dueIndex : 0);
      setResult(null);
      setTaskDraft(null);
      setTaskCreated(false);
      setRecitation("");
      setShowAnswer(false);
      setConfirmDelete(false);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (!active || !currentUnit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const reviewed = await reviewMemorizationUnit(active.id, {
        unitId: currentUnit.id,
        recitation,
        expectedVersion: storageVersion,
      });
      setActive(reviewed.material);
      setStorageVersion(reviewed.storageVersion);
      setResult(reviewed);
      setTaskDraft(reviewed.taskDraft);
      setTaskCreated(false);
      setShowAnswer(true);
      await reloadList();
    } catch (reviewError) {
      setError(friendlyError(reviewError));
    } finally {
      setBusy(false);
    }
  };

  const nextUnit = () => {
    if (!active) return;
    setUnitIndex((current) => (current + 1) % active.units.length);
    setRecitation("");
    setResult(null);
    setTaskDraft(null);
    setTaskCreated(false);
    setShowAnswer(false);
  };

  const confirmTask = async () => {
    if (!taskDraft) return;
    setBusy(true);
    setError(null);
    try {
      await createTask(taskDraft as TaskInput);
      setTaskCreated(true);
      setNotice("复习提醒已由核心任务系统创建。你可以在任务页继续编辑或取消。" );
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "任务创建失败。" );
    } finally {
      setBusy(false);
    }
  };

  const removeMaterial = async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMemorizationMaterial(active.id, storageVersion);
      setActive(null);
      setConfirmDelete(false);
      setResult(null);
      await reloadList();
      setNotice("背书材料及其学习记录已删除。" );
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-16 text-center text-sm text-zinc-500">正在读取背书插件…</p>;
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs text-zinc-500">已导入材料</p><h2 className="font-semibold">复习库</h2></div>
          <button type="button" onClick={() => setActive(null)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">导入</button>
        </div>
        {materials.length === 0 && <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500 dark:bg-zinc-900">尚无材料。粘贴文本后，先校对自动拆分的知识单元。</p>}
        {materials.map((item) => (
          <button key={item.id} type="button" onClick={() => void openMaterial(item.id)} className={`w-full rounded-xl border p-3 text-left ${active?.id === item.id ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-200 dark:border-zinc-800"}`}>
            <span className="block truncate text-sm font-medium">{item.title}</span>
            <span className="mt-1 block text-xs text-zinc-500">{item.reviewedUnitCount}/{item.unitCount} 已复习{item.averageScore === null ? "" : ` · 均分 ${item.averageScore}`}</span>
            <span className="mt-1 block text-[11px] text-zinc-400">下次：{dateLabel(item.nextReviewAt)}</span>
          </button>
        ))}
      </aside>

      <main className="min-w-0 space-y-4">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error} <AppLink href="/plugins" className="ml-1 underline">插件设置</AppLink></div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}

        {!active ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-600">材料 → 校对 → 复述</p>
            <h2 className="mt-2 text-xl font-semibold">导入背书材料</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">自动分段只提供草稿；保存前你可以修改提示和原文，避免模型或算法替你决定知识边界。</p>
            <label className="mt-5 block text-sm font-medium">材料标题<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none focus:border-blue-500 dark:border-zinc-700" placeholder="例如：中国近代史第三章" /></label>
            <label className="mt-4 block text-sm font-medium">原始材料<textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} maxLength={6000} rows={9} className="mt-2 w-full resize-y rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 leading-6 outline-none focus:border-blue-500 dark:border-zinc-700" placeholder="粘贴需要背诵的内容；空行会优先作为单元边界。" /></label>
            <button type="button" onClick={prepareUnits} className="mt-4 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950">生成可校对单元</button>
            {draftUnits.length > 0 && (
              <div className="mt-6 space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <div><h3 className="font-semibold">保存前校对（{draftUnits.length} 个单元）</h3><p className="mt-1 text-xs text-zinc-500">提示只在复习时显示；目标原文会在提交复述后揭示。</p></div>
                {draftUnits.map((unit, index) => (
                  <article key={index} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <label className="text-xs font-medium text-zinc-500">单元 {index + 1} 提示<input value={unit.cue} onChange={(event) => setDraftUnits((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, cue: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" /></label>
                    <label className="mt-3 block text-xs font-medium text-zinc-500">目标原文<textarea value={unit.content} onChange={(event) => setDraftUnits((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))} rows={3} className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm leading-6 dark:border-zinc-700" /></label>
                  </article>
                ))}
                <button type="button" disabled={busy || !title.trim()} onClick={() => void saveMaterial()} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-45">{busy ? "保存中…" : "确认单元并开始复习"}</button>
              </div>
            )}
          </section>
        ) : currentUnit ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs text-zinc-500">单元 {unitIndex + 1}/{active.units.length} · 已完成 {progress?.reviewed}/{progress?.total}</p><h2 className="mt-1 text-xl font-semibold">{active.title}</h2></div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{currentUnit.cue}</span>
            </div>
            <div className="mt-5 rounded-2xl bg-zinc-950 p-5 text-zinc-50 dark:bg-zinc-900"><p className="text-xs text-zinc-400">回忆提示</p><p className="mt-2 text-base leading-7">{currentUnit.cue}</p></div>
            <label className="mt-5 block text-sm font-medium">请凭记忆复述<textarea value={recitation} onChange={(event) => setRecitation(event.target.value)} disabled={Boolean(result)} rows={7} maxLength={4000} className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-3 leading-7 outline-none focus:border-blue-500 disabled:opacity-70 dark:border-zinc-700" placeholder="不必逐字一致，但请覆盖关键事实和逻辑关系。" /></label>
            {!result && <button type="button" disabled={busy || !recitation.trim()} onClick={() => void submitReview()} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-45">{busy ? "评分中…" : "提交复述并评分"}</button>}

            {result && (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                  <div className="rounded-2xl bg-blue-50 p-4 text-center dark:bg-blue-950/30"><p className="text-4xl font-semibold text-blue-700 dark:text-blue-300">{result.evaluation.score}</p><p className="mt-1 text-xs text-zinc-500">{result.evaluation.source === "model" ? "模型 + 确定性复核" : "确定性评分"}</p></div>
                  <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900"><p className="text-sm leading-6">{result.evaluation.feedback}</p>{result.evaluation.missedPoints.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">{result.evaluation.missedPoints.map((point) => <li key={point}>{point}</li>)}</ul>}</div>
                </div>
                <button type="button" onClick={() => setShowAnswer((value) => !value)} className="text-sm font-medium text-blue-600 underline dark:text-blue-400">{showAnswer ? "隐藏目标原文" : "查看目标原文"}</button>
                {showAnswer && <div className="rounded-xl border border-zinc-200 p-4 text-sm leading-7 dark:border-zinc-800"><p className="mb-1 text-xs text-zinc-500">目标原文</p>{currentUnit.content}</div>}
                {taskDraft ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"><p className="font-medium">建议下次复习：{dateLabel(taskDraft.schedule.runAt)}</p><p className="mt-1 text-xs text-zinc-500">这只是插件提交的草稿；点击后才会进入核心任务系统。</p><button type="button" disabled={busy || taskCreated} onClick={() => void confirmTask()} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{taskCreated ? "提醒已创建" : "确认创建复习提醒"}</button></div>
                ) : result.taskDraftUnavailable ? <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">未获得“任务草稿”授权，本次成绩已保存，但不会自动创建提醒。</p> : null}
                <button type="button" onClick={nextUnit} className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium dark:border-zinc-700">下一个单元</button>
              </div>
            )}
            <div className="mt-6 border-t border-zinc-200 pt-4 text-right dark:border-zinc-800">
              {confirmDelete ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs text-red-600">同时删除成绩记录，无法恢复。</span>
                  <button type="button" disabled={busy} onClick={() => void removeMaterial()} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">确认删除</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700">取消</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-red-600 underline">删除当前材料</button>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
