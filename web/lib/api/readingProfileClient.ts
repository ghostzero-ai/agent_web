import { apiFetch } from "@/lib/api/clientRuntime";

export type ReadingDifficulty = "introductory" | "intermediate" | "advanced";
export type ReadingGoal = "beginner" | "systematic" | "broaden" | "literary";

export type ReadingProfile = {
  userId: string;
  topics: string[];
  readBooks: string[];
  wantToReadBooks: string[];
  dislikedBooks: string[];
  difficulty: ReadingDifficulty;
  weeklyMinutes: number;
  goal: ReadingGoal;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ReadingProfileInput = Omit<
  ReadingProfile,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class ReadingProfileClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReadingProfileClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await apiFetch("/api/v1/reading-profile", {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ReadingProfileClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  return (body as { data: T }).data;
}

export function getReadingProfile(): Promise<ReadingProfile> {
  return request();
}

export function updateReadingProfile(
  input: ReadingProfileInput,
): Promise<ReadingProfile> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
