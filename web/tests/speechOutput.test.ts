import { describe, expect, it, vi } from "vitest";
import {
  createSystemSpeechOutputAdapter,
  type SpeechEnvironment,
} from "@/lib/platform/speechOutput";

type FakeUtterance = SpeechSynthesisUtterance & { text: string };

function environment(options: { finish?: boolean } = {}) {
  const spoken: FakeUtterance[] = [];
  const voices = [
    {
      voiceURI: "en-default",
      name: "English",
      lang: "en-US",
      localService: true,
      default: true,
    },
    {
      voiceURI: "zh-local",
      name: "中文",
      lang: "zh-CN",
      localService: true,
      default: false,
    },
  ] as SpeechSynthesisVoice[];
  const synthesis = {
    getVoices: () => voices,
    cancel: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => {
      spoken.push(utterance);
      if (options.finish !== false) queueMicrotask(() => utterance.onend?.({} as SpeechSynthesisEvent));
    }),
  } as unknown as SpeechSynthesis;
  const value: SpeechEnvironment = {
    synthesis,
    createUtterance(text) {
      return {
        text,
        lang: "",
        rate: 1,
        pitch: 1,
        volume: 1,
        voice: null,
        onend: null,
        onerror: null,
      } as unknown as FakeUtterance;
    },
    wait: () => Promise.resolve(),
  };
  return { value, spoken, synthesis };
}

describe("system speech output adapter", () => {
  it("lists voices and applies the selected profile to every speech chunk", async () => {
    const fake = environment();
    const adapter = createSystemSpeechOutputAdapter(fake.value);
    await expect(adapter.listVoices()).resolves.toMatchObject([
      { id: "en-default", default: true },
      { id: "zh-local", language: "zh-CN" },
    ]);

    await adapter.speak({
      text: "第一段。".repeat(80),
      voiceProfileId: "zh-local",
      language: "zh-CN",
      rate: 0.9,
      pitch: 1.1,
      volume: 0.8,
    });
    expect(fake.spoken.length).toBeGreaterThan(1);
    expect(fake.spoken[0]).toMatchObject({
      lang: "zh-CN",
      rate: 0.9,
      pitch: 1.1,
      volume: 0.8,
      voice: expect.objectContaining({ voiceURI: "zh-local" }),
    });
  });

  it("settles an in-flight request when stop is called even without browser events", async () => {
    const fake = environment({ finish: false });
    const adapter = createSystemSpeechOutputAdapter(fake.value);
    const speaking = adapter.speak({
      text: "不会自动完成",
      voiceProfileId: "",
      language: "zh-CN",
    });
    await Promise.resolve();
    await adapter.stop();
    await expect(speaking).rejects.toMatchObject({ code: "SPEECH_CANCELLED" });
    expect(fake.synthesis.cancel).toHaveBeenCalled();
  });
});
