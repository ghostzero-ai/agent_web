import { apiFetch } from "@/lib/api/clientRuntime";
import type {
  GameCharacterController,
  GameCharacterInput,
  GameSessionKind,
  GameSessionStatus,
  GameWorldInput,
} from "@/lib/game/contracts";

export type GameSessionSummary = {
  id: string;
  userId: string;
  title: string;
  kind: GameSessionKind;
  status: GameSessionStatus;
  worldName: string;
  worldPremise: string;
  worldTone: string;
  worldRules: string[];
  safetyBoundaries: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type GameCharacter = {
  id: string;
  sessionId: string;
  name: string;
  role: string;
  controller: GameCharacterController;
  description: string;
  personality: string;
  goals: string[];
  boundaries: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type GameSessionDetail = GameSessionSummary & {
  characters: GameCharacter[];
};

export class GameSessionClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GameSessionClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GameSessionClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (body as { data: T }).data;
}

export function listGameSessions(): Promise<GameSessionSummary[]> {
  return request("/api/v1/game-sessions");
}

export function getGameSession(id: string): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(id)}`);
}

export function createGameSession(input: {
  title: string;
  kind: GameSessionKind;
  world: GameWorldInput;
  initialCharacter: GameCharacterInput | null;
}): Promise<GameSessionDetail> {
  return request("/api/v1/game-sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGameSession(
  id: string,
  input: {
    title: string;
    kind: GameSessionKind;
    world: GameWorldInput;
    expectedVersion: number;
  },
): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteGameSession(id: string, expectedVersion: number): Promise<void> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function createGameCharacter(
  sessionId: string,
  input: GameCharacterInput & { expectedSessionVersion: number },
): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(sessionId)}/characters`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGameCharacter(
  sessionId: string,
  characterId: string,
  input: GameCharacterInput & {
    expectedSessionVersion: number;
    expectedCharacterVersion: number;
  },
): Promise<GameSessionDetail> {
  return request(
    `/api/v1/game-sessions/${encodeURIComponent(sessionId)}/characters/${encodeURIComponent(characterId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteGameCharacter(
  sessionId: string,
  characterId: string,
  expectedSessionVersion: number,
  expectedCharacterVersion: number,
): Promise<GameSessionDetail> {
  return request(
    `/api/v1/game-sessions/${encodeURIComponent(sessionId)}/characters/${encodeURIComponent(characterId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ expectedSessionVersion, expectedCharacterVersion }),
    },
  );
}
