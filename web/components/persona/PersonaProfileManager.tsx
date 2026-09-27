"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  getPersonaProfile,
  updatePersonaProfile,
  type PersonaProfile,
} from "@/lib/api/personaProfileClient";
import { buildPersonaInstruction } from "@/lib/persona/personaProfile";

type FormState = Pick<
  PersonaProfile,
  "name" | "warmth" | "humor" | "directness" | "verbosity" | "initiative"
> & { preferredAddress: string };

const AXES = [
  { key: "warmth", label: "温暖度", low: "克制", high: "温暖", hint: "影响共情和鼓励的表达强度" },
  { key: "humor", label: "幽默度", low: "严肃", high: "轻松", hint: "严肃与高风险场景始终禁用幽默" },
  { key: "directness", label: "直接度", low: "委婉", high: "直率", hint: "只改变措辞，不回避事实或风险" },
  { key: "verbosity", label: "回答篇幅", low: "精简", high: "详细", hint: "复杂问题仍会保留必要解释" },
  { key: "initiative", label: "对话内引导", low: "少追问", high: "多引导", hint: "仅影响当前对话，不代表主动推送" },
] as const;

function profileForm(profile: PersonaProfile): FormState {
  return {
    name: profile.name,
    preferredAddress: profile.preferredAddress ?? "",
    warmth: profile.warmth,
    humor: profile.humor,
    directness: profile.directness,
    verbosity: profile.verbosity,
    initiative: profile.initiative,
  };
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "保存失败，请稍后重试。";
}

export function PersonaProfileManager() {
  const [profile, setProfile] = useState<PersonaProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getPersonaProfile()
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
        setForm(profileForm(loaded));
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !form) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updatePersonaProfile({
        ...form,
        name: form.name.trim(),
        preferredAddress: form.preferredAddress.trim() || null,
        expectedVersion: profile.version,
      });
      setProfile(updated);
      setForm(profileForm(updated));
      setSaved(true);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取人格设置…</p>;
  }
  if (!form || !profile) {
    return <div role="alert" className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error ?? "无法读取人格设置。"}</div>;
  }

  const preview = buildPersonaInstruction({
    ...form,
    preferredAddress: form.preferredAddress.trim() || null,
  });

  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Persona profile</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">她怎样与你说话</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">这些设置只调整表达、篇幅和互动节奏；事实、证据、引用和安全标准始终由更高层策略控制。</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            助手称呼
            <input required maxLength={40} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300" />
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            希望她怎样称呼你（可选）
            <input maxLength={40} value={form.preferredAddress} onChange={(event) => setForm({ ...form, preferredAddress: event.target.value })} placeholder="例如：小林" className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300" />
          </label>
        </div>

        <div className="space-y-5">
          {AXES.map((axis) => (
            <label key={axis.key} className="block rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span>{axis.label}</span>
                <span className="tabular-nums text-zinc-500">{form[axis.key]}</span>
              </span>
              <input aria-label={axis.label} type="range" min={0} max={100} step={10} value={form[axis.key]} onChange={(event) => setForm({ ...form, [axis.key]: Number(event.target.value) })} className="mt-3 w-full accent-violet-600" />
              <span className="mt-1 flex justify-between text-xs text-zinc-500"><span>{axis.low}</span><span>{axis.high}</span></span>
              <span className="mt-2 block text-xs text-zinc-500">{axis.hint}</span>
            </label>
          ))}
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">人格设置已保存，下一次模型回答会使用新设置。</p>}
        <button type="submit" disabled={saving} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">
          {saving ? "保存中…" : "保存人格设置"}
        </button>
      </section>

      <aside className="h-fit space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm leading-6 text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
        <h2 className="font-semibold">实时规则预览</h2>
        <p className="text-xs opacity-75">这是服务端将采用的结构化表达层预览，不包含 API Key、记忆或对话内容。</p>
        <pre data-testid="persona-preview" className="whitespace-pre-wrap break-words font-sans text-xs leading-5">{preview}</pre>
      </aside>
    </form>
  );
}
