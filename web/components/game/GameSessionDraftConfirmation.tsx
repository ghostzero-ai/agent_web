"use client";

import { useRef, useState } from "react";
import { createGameSession } from "@/lib/api/gameSessionClient";
import { AppLink } from "@/components/platform/AppLink";
import { gameSessionDraftSchema, type GameSessionDraft } from "@/lib/gameRulePacks/contracts";

/** Host-owned confirmation: a rule pack only supplies a draft, never a Repository. */
export function GameSessionDraftConfirmation({ draft }: { draft: GameSessionDraft }) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (submitting.current || createdId) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const validated = gameSessionDraftSchema.parse(draft);
      const session = await createGameSession(validated.session);
      setCreatedId(session.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建失败，请重试。");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {createdId ? (
        <div className="space-y-3">
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">游戏会话已创建，可以进入故事了。</p>
          <AppLink href={`/entertainment?session=${encodeURIComponent(createdId)}`} className="inline-block rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-medium text-white">进入游戏</AppLink>
        </div>
      ) : (
        <>
          <p className="text-xs leading-5 text-zinc-500">确认后将保存世界规则与角色卡。故事准备好后，点击“开始故事”即可继续。</p>
          <button type="button" disabled={busy} onClick={() => void confirm()} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "创建中…" : "确认创建游戏会话"}</button>
        </>
      )}
    </div>
  );
}
