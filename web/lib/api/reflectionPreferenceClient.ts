import { apiFetch } from "@/lib/api/clientRuntime";

export type ReflectionStyle = "gentle" | "balanced" | "challenging";

export type ReflectionPreference = {
  userId: string;
  enabled: boolean;
  goals: string[];
  avoidTopics: string[];
  style: ReflectionStyle;
  maxQuestions: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ReflectionPreferenceInput = Omit<
  ReflectionPreference,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class ReflectionPreferenceClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReflectionPreferenceClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await apiFetch("/api/v1/reflection-preferences", {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ReflectionPreferenceClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  return (body as { data: T }).data;
}

export function getReflectionPreference(): Promise<ReflectionPreference> {
  return request();
}

export function updateReflectionPreference(
  input: ReflectionPreferenceInput,
): Promise<ReflectionPreference> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
