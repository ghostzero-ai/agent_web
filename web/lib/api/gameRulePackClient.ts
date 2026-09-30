import { apiFetch } from "@/lib/api/clientRuntime";
import {
  gameRulePackDraftResultSchema,
  gameRulePackSetupResultSchema,
} from "@/lib/gameRulePacks/contracts";

export class GameRulePackClientError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "GameRulePackClientError";
  }
}

async function request(id: string, init?: RequestInit): Promise<unknown> {
  const response = await apiFetch(`/api/v1/game-rule-packs/${encodeURIComponent(id)}`, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GameRulePackClientError(
      typeof body?.error?.message === "string" ? body.error.message : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  return body?.data;
}

export async function getGameRulePackSetup(id: string) {
  return gameRulePackSetupResultSchema.parse(await request(id));
}

export async function prepareGameRulePackDraft(id: string, setup: unknown, expectedVersion: number) {
  return gameRulePackDraftResultSchema.parse(await request(id, {
    method: "POST", body: JSON.stringify({ setup, expectedVersion }),
  }));
}
