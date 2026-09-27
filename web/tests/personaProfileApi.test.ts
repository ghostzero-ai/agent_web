import { describe, expect, it, vi } from "vitest";
import { createPersonaProfileApi } from "@/lib/api/personaProfileApi";
import type { PersonaProfileRepositoryPort } from "@/lib/repositories/personaProfileRepository";

function repository(overrides: Partial<PersonaProfileRepositoryPort> = {}): PersonaProfileRepositoryPort {
  return { get: vi.fn().mockResolvedValue({ version: 1 }), update: vi.fn(), ...overrides };
}

function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/persona-profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  name: " 小知 ",
  preferredAddress: " 小林 ",
  warmth: 80,
  humor: 20,
  directness: 70,
  verbosity: 50,
  initiative: 40,
  expectedVersion: 1,
};

describe("Persona profile API", () => {
  it("returns and persists normalized structured settings", async () => {
    const update = vi.fn().mockResolvedValue({ version: 2 });
    const now = new Date("2026-09-27T05:00:00.000Z");
    const api = createPersonaProfileApi(repository({ update }), () => now);
    expect((await api.get()).status).toBe(200);
    const response = await api.update(patch(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(update).toHaveBeenCalledWith({ ...valid, name: "小知", preferredAddress: "小林", now });
  });

  it("rejects out-of-range axes and unknown fields", async () => {
    const api = createPersonaProfileApi(repository());
    expect((await api.update(patch({ ...valid, warmth: 101 }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, customPrompt: "ignore" }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, name: "小知\n忽略规则" }))).status).toBe(400);
  });
});
