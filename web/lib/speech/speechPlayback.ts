import { getVoiceProfile } from "@/lib/api/voiceProfileClient";
import {
  getSpeechOutputAdapter,
  SpeechOutputError,
} from "@/lib/platform/speechOutput";
import { prepareSpeechText } from "@/lib/speech/speechPolicy";

export type SpeechPlaybackState = {
  messageId: string | null;
  status: "idle" | "loading" | "speaking" | "error";
  message: string | null;
};

let state: SpeechPlaybackState = {
  messageId: null,
  status: "idle",
  message: null,
};
let generation = 0;
const listeners = new Set<(state: SpeechPlaybackState) => void>();

function publish(next: SpeechPlaybackState) {
  state = next;
  for (const listener of listeners) listener(state);
}

export function getSpeechPlaybackState(): SpeechPlaybackState {
  return state;
}

export function subscribeSpeechPlayback(
  listener: (state: SpeechPlaybackState) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function playSpeech(messageId: string, markdown: string) {
  generation += 1;
  const activeGeneration = generation;
  const adapter = getSpeechOutputAdapter();
  await adapter.stop();
  publish({ messageId, status: "loading", message: null });

  try {
    const profile = await getVoiceProfile();
    if (activeGeneration !== generation) return;
    const prepared = prepareSpeechText(markdown);
    if (!prepared.text) throw new Error("这条回答没有可以朗读的文字。");
    publish({
      messageId,
      status: "speaking",
      message: prepared.truncated ? "回答较长，本次只朗读前 5000 个字符。" : null,
    });
    await getSpeechOutputAdapter(profile.provider).speak({
      text: prepared.text,
      voiceProfileId: profile.voiceId ?? "",
      language: profile.language,
      rate: profile.rate / 100,
      pitch: profile.pitch / 100,
      volume: profile.volume / 100,
    });
    if (activeGeneration === generation) {
      publish({ messageId: null, status: "idle", message: null });
    }
  } catch (error) {
    if (activeGeneration !== generation) return;
    if (error instanceof SpeechOutputError && error.code === "SPEECH_CANCELLED") {
      publish({ messageId: null, status: "idle", message: null });
      return;
    }
    publish({
      messageId,
      status: "error",
      message: error instanceof Error ? error.message : "语音播放失败。",
    });
  }
}

export async function stopSpeech() {
  generation += 1;
  await getSpeechOutputAdapter().stop();
  publish({ messageId: null, status: "idle", message: null });
}
