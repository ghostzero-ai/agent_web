import { apiFetch } from "@/lib/api/clientRuntime";

export type VoiceProfile = {
  userId: string;
  provider: "system";
  voiceId: string | null;
  language: string;
  rate: number;
  pitch: number;
  volume: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type VoiceProfileInput = Omit<
  VoiceProfile,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class VoiceProfileClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VoiceProfileClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await apiFetch("/api/v1/voice-profile", {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new VoiceProfileClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  return (body as { data: T }).data;
}

export function getVoiceProfile(): Promise<VoiceProfile> {
  return request();
}

export function updateVoiceProfile(input: VoiceProfileInput): Promise<VoiceProfile> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
