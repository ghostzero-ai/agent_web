import { apiFetch } from "@/lib/api/clientRuntime";

export type PersonaProfile = {
  userId: string;
  name: string;
  preferredAddress: string | null;
  warmth: number;
  humor: number;
  directness: number;
  verbosity: number;
  initiative: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PersonaProfileInput = Omit<
  PersonaProfile,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class PersonaProfileClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PersonaProfileClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await apiFetch("/api/v1/persona-profile", {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PersonaProfileClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  return (body as { data: T }).data;
}

export function getPersonaProfile(): Promise<PersonaProfile> {
  return request();
}

export function updatePersonaProfile(input: PersonaProfileInput): Promise<PersonaProfile> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
