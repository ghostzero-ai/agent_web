"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  getVoiceProfile,
  updateVoiceProfile,
  type VoiceProfile,
} from "@/lib/api/voiceProfileClient";
import type { SpeechVoiceOption } from "@/lib/platform/capabilities";
import {
  getSpeechOutputAdapter,
  SpeechOutputError,
} from "@/lib/platform/speechOutput";
import { prepareSpeechText } from "@/lib/speech/speechPolicy";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

type FormState = Pick<
  VoiceProfile,
  "provider" | "language" | "rate" | "pitch" | "volume"
> & { voiceId: string };

const PREVIEW_TEXT =
  "你好，我是知伴。语音只是文字回答的表达方式；无论音线如何变化，事实和专业标准都不会改变。";

function profileForm(profile: VoiceProfile): FormState {
  return {
    provider: profile.provider,
    voiceId: profile.voiceId ?? "",
    language: profile.language,
    rate: profile.rate,
    pitch: profile.pitch,
    volume: profile.volume,
  };
}

function friendlyError(error: unknown): string {
  if (error instanceof SpeechOutputError) return error.message;
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function RangeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  low: string;
  high: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <span className="flex items-center justify-between text-sm font-medium text-zinc-800 dark:text-zinc-200">
        <span>{props.label}</span>
        <span className="tabular-nums text-zinc-500">{props.value}%</span>
      </span>
      <input
        aria-label={props.label}
        type="range"
        min={props.min}
        max={props.max}
        step={10}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="mt-3 w-full accent-violet-600"
      />
      <span className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>{props.low}</span><span>{props.high}</span>
      </span>
    </label>
  );
}

export function VoiceProfileManager() {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [voices, setVoices] = useState<SpeechVoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useNavigationGuard(saving || Boolean(profile && form && JSON.stringify(form) !== JSON.stringify(profileForm(profile))));
  const adapter = getSpeechOutputAdapter();

  const refreshVoices = async () => {
    setRefreshing(true);
    setError(null);
    try {
      setVoices(await adapter.listVoices());
    } catch (refreshError) {
      setError(friendlyError(refreshError));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.all([getVoiceProfile(), adapter.listVoices()])
      .then(([loadedProfile, loadedVoices]) => {
        if (!active) return;
        setProfile(loadedProfile);
        setForm(profileForm(loadedProfile));
        setVoices(loadedVoices);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      void adapter.stop();
    };
  }, [adapter]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !form) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateVoiceProfile({
        ...form,
        voiceId: form.voiceId || null,
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

  const preview = async () => {
    if (!form) return;
    setPreviewing(true);
    setError(null);
    try {
      const prepared = prepareSpeechText(PREVIEW_TEXT);
      await adapter.speak({
        text: prepared.text,
        voiceProfileId: form.voiceId,
        language: form.language,
        rate: form.rate / 100,
        pitch: form.pitch / 100,
        volume: form.volume / 100,
      });
    } catch (previewError) {
      if (!(previewError instanceof SpeechOutputError) || previewError.code !== "SPEECH_CANCELLED") {
        setError(friendlyError(previewError));
      }
    } finally {
      setPreviewing(false);
    }
  };

  const stop = async () => {
    await adapter.stop();
    setPreviewing(false);
  };

  if (loading) {
    return <p className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取语音设置…</p>;
  }
  if (!form || !profile) {
    return <div role="alert" className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error ?? "无法读取语音设置。"}</div>;
  }

  const savedVoiceUnavailable =
    form.voiceId && !voices.some((voice) => voice.id === form.voiceId);
  const languages = [...new Set([form.language, "zh-CN", "zh-TW", "en-US", ...voices.map((voice) => voice.language)])];

  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Voice profile</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">选择她的声音</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">当前使用设备自带的免费系统语音，文字不会上传到额外的语音服务。文字回答始终是事实来源，朗读失败也不会影响回答。</p>
        </div>

        {!adapter.isSupported() && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">当前浏览器或 WebView 没有提供系统语音能力。你仍可保存设置，换到支持的设备后使用。</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            TTS Provider
            <select value={form.provider} disabled className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
              <option value="system">设备系统语音（本地）</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            朗读语言
            <select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              {languages.map((language) => <option key={language} value={language}>{language}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          当前设备音线
          <div className="mt-1.5 flex gap-2">
            <select
              aria-label="当前设备音线"
              value={form.voiceId}
              onChange={(event) => {
                const selected = voices.find((voice) => voice.id === event.target.value);
                setForm({
                  ...form,
                  voiceId: event.target.value,
                  language: selected?.language ?? form.language,
                });
              }}
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">自动选择当前设备的最佳音线</option>
              {savedVoiceUnavailable && <option value={form.voiceId}>已保存音线（当前设备不可用）</option>}
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} · {voice.language}{voice.local ? " · 本地" : ""}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void refreshVoices()} disabled={refreshing} className="shrink-0 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-medium dark:border-zinc-700">
              {refreshing ? "刷新中…" : "刷新"}
            </button>
          </div>
          <span className="mt-1 block text-xs font-normal text-zinc-500">音线由当前设备提供；换设备时若找不到同一音线，会按语言自动回退。</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <RangeField label="语速" value={form.rate} min={50} max={200} low="慢" high="快" onChange={(rate) => setForm({ ...form, rate })} />
          <RangeField label="音高" value={form.pitch} min={0} max={200} low="低" high="高" onChange={(pitch) => setForm({ ...form, pitch })} />
          <RangeField label="音量" value={form.volume} min={0} max={100} low="静音" high="最大" onChange={(volume) => setForm({ ...form, volume })} />
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">语音设置已保存，聊天中的下一次朗读会使用新设置。</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void preview()} disabled={!adapter.isSupported() || previewing} className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-800 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
            {previewing ? "正在试听…" : "试听音线"}
          </button>
          <button type="button" onClick={() => void stop()} disabled={!previewing} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium disabled:opacity-40 dark:border-zinc-700">
            停止试听
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">
            {saving ? "保存中…" : "保存语音设置"}
          </button>
        </div>
      </section>

      <aside className="h-fit space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm leading-6 text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
        <h2 className="font-semibold">语音边界</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>聊天回答生成完成后，点击“朗读”才会播放。</li>
          <li>公式会读作“公式”，代码块会明确省略，避免朗读乱码。</li>
          <li>长回答按句切分，可随时停止；单次最多朗读 5000 个字符。</li>
          <li>当前 Provider 不克隆真人声音，也不会把文字发送到第三方 TTS。</li>
        </ul>
      </aside>
    </form>
  );
}
