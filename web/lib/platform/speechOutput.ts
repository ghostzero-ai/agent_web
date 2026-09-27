import type {
  SpeechOutputAdapter,
  SpeechRequest,
  SpeechVoiceOption,
} from "@/lib/platform/capabilities";
import { splitSpeechText } from "@/lib/speech/speechPolicy";

export type SpeechOutputErrorCode =
  | "SPEECH_UNSUPPORTED"
  | "SPEECH_EMPTY"
  | "SPEECH_CANCELLED"
  | "SPEECH_FAILED";

export class SpeechOutputError extends Error {
  constructor(
    readonly code: SpeechOutputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SpeechOutputError";
  }
}

export type SpeechEnvironment = {
  synthesis: SpeechSynthesis | null;
  createUtterance(text: string): SpeechSynthesisUtterance;
  wait(milliseconds: number): Promise<void>;
};

function browserEnvironment(): SpeechEnvironment {
  const synthesis =
    typeof window !== "undefined" && "speechSynthesis" in window
      ? window.speechSynthesis
      : null;
  return {
    synthesis,
    createUtterance(text) {
      if (typeof SpeechSynthesisUtterance === "undefined") {
        throw new SpeechOutputError("SPEECH_UNSUPPORTED", "当前设备不支持系统语音。");
      }
      return new SpeechSynthesisUtterance(text);
    },
    wait(milliseconds) {
      return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    },
  };
}

function voiceOption(voice: SpeechSynthesisVoice): SpeechVoiceOption {
  return {
    id: voice.voiceURI,
    name: voice.name,
    language: voice.lang,
    local: voice.localService,
    default: voice.default,
  };
}

function selectVoice(
  voices: readonly SpeechSynthesisVoice[],
  request: SpeechRequest,
): SpeechSynthesisVoice | null {
  return (
    voices.find((voice) => voice.voiceURI === request.voiceProfileId) ??
    voices.find(
      (voice) =>
        request.language &&
        voice.lang.toLocaleLowerCase() === request.language.toLocaleLowerCase(),
    ) ??
    voices.find(
      (voice) =>
        request.language &&
        voice.lang.toLocaleLowerCase().startsWith(
          request.language.split("-", 1)[0].toLocaleLowerCase(),
        ),
    ) ??
    voices.find((voice) => voice.default) ??
    null
  );
}

export function createSystemSpeechOutputAdapter(
  environment: SpeechEnvironment = browserEnvironment(),
): SpeechOutputAdapter {
  let generation = 0;
  let cancelCurrent: (() => void) | null = null;

  const currentVoices = () => environment.synthesis?.getVoices() ?? [];

  return {
    provider: "system",
    isSupported() {
      return environment.synthesis !== null;
    },
    async listVoices() {
      if (!environment.synthesis) return [];
      let voices = currentVoices();
      if (voices.length === 0) {
        await environment.wait(350);
        voices = currentVoices();
      }
      return voices
        .map(voiceOption)
        .sort(
          (left, right) =>
            Number(right.default) - Number(left.default) ||
            left.language.localeCompare(right.language) ||
            left.name.localeCompare(right.name),
        );
    },
    async speak(request) {
      const synthesis = environment.synthesis;
      if (!synthesis) {
        throw new SpeechOutputError("SPEECH_UNSUPPORTED", "当前设备不支持系统语音。");
      }
      const chunks = splitSpeechText(request.text);
      if (chunks.length === 0) {
        throw new SpeechOutputError("SPEECH_EMPTY", "没有可以朗读的文字。");
      }

      generation += 1;
      const activeGeneration = generation;
      cancelCurrent?.();
      cancelCurrent = null;
      synthesis.cancel();
      const voice = selectVoice(synthesis.getVoices(), request);

      for (const chunk of chunks) {
        if (activeGeneration !== generation) {
          throw new SpeechOutputError("SPEECH_CANCELLED", "朗读已停止。");
        }
        let cancelChunk: (() => void) | null = null;
        try {
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: SpeechOutputError) => {
              if (settled) return;
              settled = true;
              if (error) reject(error);
              else resolve();
            };
            const utterance = environment.createUtterance(chunk);
            utterance.lang = request.language ?? voice?.lang ?? "zh-CN";
            utterance.rate = request.rate ?? 1;
            utterance.pitch = request.pitch ?? 1;
            utterance.volume = request.volume ?? 1;
            if (voice) utterance.voice = voice;
            cancelChunk = () =>
              finish(new SpeechOutputError("SPEECH_CANCELLED", "朗读已停止。"));
            cancelCurrent = cancelChunk;
            utterance.onend = () => finish();
            utterance.onerror = (event) => {
              if (activeGeneration !== generation || event.error === "canceled") {
                finish(new SpeechOutputError("SPEECH_CANCELLED", "朗读已停止。"));
                return;
              }
              finish(new SpeechOutputError("SPEECH_FAILED", "系统语音播放失败。"));
            };
            synthesis.speak(utterance);
          });
        } finally {
          if (cancelCurrent === cancelChunk) cancelCurrent = null;
        }
      }
    },
    async stop() {
      generation += 1;
      const cancel = cancelCurrent;
      cancelCurrent = null;
      environment.synthesis?.cancel();
      cancel?.();
    },
  };
}

let systemAdapter: SpeechOutputAdapter | null = null;

export function getSpeechOutputAdapter(provider: "system" = "system") {
  if (provider !== "system") {
    throw new SpeechOutputError("SPEECH_UNSUPPORTED", "尚未配置该语音 Provider。");
  }
  systemAdapter ??= createSystemSpeechOutputAdapter();
  return systemAdapter;
}
