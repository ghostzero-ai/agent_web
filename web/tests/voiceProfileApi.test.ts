import { describe, expect, it, vi } from "vitest";
import { createVoiceProfileApi } from "@/lib/api/voiceProfileApi";
import type { VoiceProfileRepositoryPort } from "@/lib/repositories/voiceProfileRepository";

function repository(
  overrides: Partial<VoiceProfileRepositoryPort> = {},
): VoiceProfileRepositoryPort {
  return {
    get: vi.fn().mockResolvedValue({ version: 1 }),
    update: vi.fn(),
    ...overrides,
  } as VoiceProfileRepositoryPort;
}

function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/voice-profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  provider: "system" as const,
  voiceId: " device-voice-1 ",
  language: "zh-CN",
  rate: 90,
  pitch: 110,
  volume: 80,
  expectedVersion: 1,
};

describe("Voice profile API", () => {
  it("returns and persists normalized structured settings", async () => {
    const update = vi.fn().mockResolvedValue({ version: 2 });
    const now = new Date("2026-09-27T08:00:00.000Z");
    const api = createVoiceProfileApi(repository({ update }), () => now);

    expect((await api.get()).status).toBe(200);
    const response = await api.update(patch(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(update).toHaveBeenCalledWith({
      ...valid,
      voiceId: "device-voice-1",
      now,
    });
  });

  it("rejects unknown providers, invalid ranges, languages and extra fields", async () => {
    const api = createVoiceProfileApi(repository());
    expect((await api.update(patch({ ...valid, provider: "remote" }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, rate: 201 }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, language: "中文" }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, apiKey: "secret" }))).status).toBe(400);
  });
});
