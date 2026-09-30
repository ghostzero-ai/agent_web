"use client";

import { useState, type FormEvent } from "react";
import {
  createGameCheckpoint,
  deleteGameCheckpoint,
  getGameSession,
  restoreGameCheckpoint,
  type GameSessionDetail,
} from "@/lib/api/gameSessionClient";

type Props = {
  detail: GameSessionDetail;
  onChange: (detail: GameSessionDetail) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : "检查点操作失败，请稍后重试。";
}

export function GameCheckpointPanel({ detail, onChange, onError, onNotice }: Props) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const recoverConflict = async (error: unknown) => {
    if (!error || typeof error !== "object" || !("code" in error)) return;
    if (!String(error.code).endsWith("VERSION_CONFLICT")) return;
    onChange(await getGameSession(detail.id));
    onError("其他设备已修改游戏，页面已刷新，请检查后重试。");
  };

  const run = async (
    action: () => Promise<GameSessionDetail>,
    success: string,
  ): Promise<boolean> => {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      onChange(await action());
      onNotice(success);
      return true;
    } catch (error) {
      onError(message(error));
      await recoverConflict(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const checkpointName = name.trim();
    if (!checkpointName || !detail.activeLeafTurnId) return;
    const saved = await run(
      () => createGameCheckpoint(detail.id, checkpointName, note.trim(), detail.version),
      `检查点“${checkpointName}”已保存。`,
    );
    if (saved) {
      setName("");
      setNote("");
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm sm:p-6 dark:border-cyan-900 dark:bg-zinc-950">
      <div>
        <h3 className="text-lg font-semibold">剧情检查点</h3>
        <p className="mt-1 text-sm text-zinc-500">恢复只会把当前续写位置切回保存的回合；之后的剧情仍保留为历史分支。</p>
      </div>

      {detail.checkpoints.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-center text-sm text-zinc-500 dark:border-zinc-700">完成至少一个回合后，可以保存当前状态。</p>
      ) : (
        <div className="space-y-2">
          {detail.checkpoints.map((checkpoint) => {
            const active = checkpoint.turnId === detail.activeLeafTurnId;
            return (
              <article key={checkpoint.id} className={`rounded-xl border p-3 ${active ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30" : "border-zinc-200 dark:border-zinc-800"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{checkpoint.name}{active ? " · 当前位置" : ""}</p>
                    {checkpoint.note && <p className="mt-1 text-xs text-zinc-500">{checkpoint.note}</p>}
                  </div>
                  <div className="flex gap-3 text-xs">
                    <button type="button" disabled={busy || active} onClick={() => void run(
                      () => restoreGameCheckpoint(detail.id, checkpoint.id, detail.version),
                      `已恢复到“${checkpoint.name}”，下一回合会从此处分支。`,
                    )} className="font-medium text-cyan-700 disabled:opacity-40 dark:text-cyan-300">恢复</button>
                    <button type="button" disabled={busy} onClick={() => {
                      if (!window.confirm(`删除检查点“${checkpoint.name}”？剧情回合不会被删除。`)) return;
                      void run(
                        () => deleteGameCheckpoint(detail.id, checkpoint.id, detail.version),
                        `检查点“${checkpoint.name}”已删除。`,
                      );
                    }} className="font-medium text-red-600 disabled:opacity-40">删除</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <form onSubmit={(event) => void create(event)} className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-[1fr_1.5fr_auto] dark:border-zinc-800">
        <label className="text-xs font-medium">检查点名称
          <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" placeholder="例如：进入钟楼前" />
        </label>
        <label className="text-xs font-medium">备注
          <input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" placeholder="可选：记录当时的计划" />
        </label>
        <button type="submit" disabled={busy || !detail.activeLeafTurnId || !name.trim()} className="self-end rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">保存检查点</button>
      </form>
    </section>
  );
}
