"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { GameSessionDraftConfirmation } from "@/components/game/GameSessionDraftConfirmation";
import { AppLink } from "@/components/platform/AppLink";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import {
  GameRulePackClientError,
  getGameRulePackSetup,
  prepareGameRulePackDraft,
} from "@/lib/api/gameRulePackClient";
import type { GameSessionDraft } from "@/lib/gameRulePacks/contracts";
import {
  DEFAULT_QUICK_ADVENTURE_SETUP,
  QUICK_ADVENTURE_ATTRIBUTES,
  QUICK_ADVENTURE_DESCRIPTOR,
  QUICK_ADVENTURE_RULE_PACK_ID,
  QUICK_ADVENTURE_SCENARIOS,
  quickAdventureSetupSchema,
  type QuickAdventureSetup,
} from "@/lib/gameRulePacks/quickAdventure";

function friendlyError(error: unknown): string {
  if (error instanceof ZodError) return "请检查主角名称和内容边界：最多 16 条边界，每条 300 字。";
  if (error instanceof GameRulePackClientError) {
    if (error.status === 403) return "请先在插件页启用“轻量冒险规则包”，并授权它保存配置，然后重新加载。";
    if (error.code.includes("VERSION_CONFLICT")) return "其他设备已修改配置。请重新加载并检查后再预览。";
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export function QuickAdventureActivity() {
  const [setup, setSetup] = useState<QuickAdventureSetup>({ ...DEFAULT_QUICK_ADVENTURE_SETUP });
  const [boundaryText, setBoundaryText] = useState(DEFAULT_QUICK_ADVENTURE_SETUP.boundaries.join("\n"));
  const [storageVersion, setStorageVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<GameSessionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [savedSetup, setSavedSetup] = useState("");
  const currentSetup = JSON.stringify({ ...setup, boundaries: boundaryText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) });
  useNavigationGuard(busy || Boolean(ready && savedSetup !== currentSetup));

  useEffect(() => {
    let active = true;
    void getGameRulePackSetup(QUICK_ADVENTURE_RULE_PACK_ID)
      .then((result) => {
        if (!active) return;
        const loaded = result.setup === null
          ? { ...DEFAULT_QUICK_ADVENTURE_SETUP }
          : quickAdventureSetupSchema.parse(result.setup);
        setSetup(loaded);
        setSavedSetup(JSON.stringify(loaded));
        setBoundaryText(loaded.boundaries.join("\n"));
        setStorageVersion(result.storageVersion);
        setReady(true);
      })
      .catch((loadError: unknown) => { if (active) setError(friendlyError(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setReady(false);
    setLoading(true);
    setError(null);
    setDraft(null);
    setReloadKey((current) => current + 1);
  }, []);

  const update = <K extends keyof QuickAdventureSetup>(key: K, value: QuickAdventureSetup[K]) => {
    setSetup((current) => ({ ...current, [key]: value }));
    setDraft(null);
  };

  const preview = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      const normalized = quickAdventureSetupSchema.parse({
        ...setup,
        boundaries: boundaryText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean),
      });
      const result = await prepareGameRulePackDraft(QUICK_ADVENTURE_RULE_PACK_ID, normalized, storageVersion);
      setStorageVersion(result.storageVersion);
      setSavedSetup(JSON.stringify(normalized));
      setDraft(result.draft);
    } catch (previewError) {
      setError(friendlyError(previewError));
    } finally {
      setBusy(false);
    }
  };

  const character = draft?.session.initialCharacter;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-900 dark:bg-violet-950/30">
        <h2 className="text-xl font-semibold">从一场短篇冒险开始</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{QUICK_ADVENTURE_DESCRIPTOR.description} 先选世界和主角专长，再预览设定。配置会保存，方便下次继续使用。</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">1d20 + 属性 · 难度 10 / 15 / 20 · 自然 20 大成功、自然 1 大失败</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <AppLink href="/plugins" className="text-violet-700 underline dark:text-violet-300">管理规则包插件</AppLink>
          <AppLink href="/entertainment" className="text-violet-700 underline dark:text-violet-300">返回游戏会话</AppLink>
          <button type="button" onClick={reload} disabled={loading || busy} className="text-zinc-600 underline disabled:opacity-50 dark:text-zinc-300">重新加载配置</button>
        </div>
      </section>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      {loading && <p role="status" className="text-sm text-zinc-500">正在读取规则包配置…</p>}

      <form onSubmit={preview} className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">冒险配置</h2>
        <fieldset disabled={!ready || busy} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
          <label className={labelClass}>世界模板<select className={inputClass} value={setup.scenarioId} onChange={(event) => update("scenarioId", event.target.value as QuickAdventureSetup["scenarioId"])}>{QUICK_ADVENTURE_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
          <label className={labelClass}>主角名称<input required maxLength={80} className={inputClass} value={setup.heroName} onChange={(event) => update("heroName", event.target.value)} /></label>
          <label className={labelClass}>擅长属性<select className={inputClass} value={setup.specialty} onChange={(event) => update("specialty", event.target.value as QuickAdventureSetup["specialty"])}>{QUICK_ADVENTURE_ATTRIBUTES.map((attribute) => <option key={attribute} value={attribute}>{attribute} +3</option>)}</select></label>
          <label className={labelClass}>故事氛围<select className={inputClass} value={setup.tone} onChange={(event) => update("tone", event.target.value as QuickAdventureSetup["tone"])}><option value="mysterious">悬疑、克制</option><option value="warm">温暖、有希望</option></select></label>
          <label className={`${labelClass} sm:col-span-2`}>内容边界<textarea rows={3} maxLength={4_816} className={inputClass} value={boundaryText} onChange={(event) => { setBoundaryText(event.target.value); setDraft(null); }} placeholder="每行一条不希望出现的内容" /><span className="mt-1 block text-xs font-normal text-zinc-500">最多 16 条，每条 300 字。随设定保存并交给故事主持人。</span></label>
        </fieldset>
        <button type="submit" disabled={!ready || loading || busy} className="rounded-xl border border-violet-300 px-5 py-2.5 text-sm font-medium text-violet-700 disabled:opacity-50 dark:border-violet-800 dark:text-violet-300">{busy ? "准备中…" : "保存配置并预览"}</button>
      </form>

      {draft && (
        <section aria-label="游戏设定预览" className="space-y-4 rounded-2xl border border-violet-200 bg-white p-5 sm:p-6 dark:border-violet-900 dark:bg-zinc-950">
          <div><h2 className="text-lg font-semibold">{draft.session.title}</h2><p className="mt-1 text-xs text-zinc-500">{QUICK_ADVENTURE_DESCRIPTOR.name} v{draft.source.rulePackVersion} · 配置已保存 · 会话尚待确认</p></div>
          <p className="text-sm leading-6">{draft.session.world.premise}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">氛围：{draft.session.world.tone}</p>
          {character && <p className="text-sm">{character.name} · {character.role} · 生命 {character.maxHealth}<br />{Object.entries(character.attributes).map(([name, value]) => `${name} +${value}`).join(" / ")}</p>}
          <details className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900"><summary className="cursor-pointer font-medium">查看完整规则与内容边界</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">{draft.session.world.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul><p className="mt-3 font-medium">内容边界</p><ul className="mt-2 list-disc space-y-1 pl-5">{draft.session.world.boundaries.map((boundary) => <li key={boundary}>{boundary}</li>)}</ul></details>
          <GameSessionDraftConfirmation draft={draft} />
        </section>
      )}
    </div>
  );
}

const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass = "mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 dark:border-zinc-700 dark:bg-zinc-950";
