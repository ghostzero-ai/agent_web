import { apiFetch } from "@/lib/api/clientRuntime";

export type MemoryCandidateKind = "preference" | "goal" | "profile" | "fact";
export type MemoryCandidateStatus = "pending" | "confirmed" | "rejected";
export type MemorySensitivity = "low" | "personal" | "sensitive";

export type MemoryCandidate = {
  id: string;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  kind: MemoryCandidateKind;
  content: string;
  evidenceQuote: string;
  sensitivity: MemorySensitivity;
  confidence: number;
  reason: string;
  status: MemoryCandidateStatus;
  resolvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export class MemoryCandidateClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MemoryCandidateClientError";
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
    throw new MemoryCandidateClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  return (body as { data: T }).data;
}

export function listMemoryCandidates(
  filter: "all" | MemoryCandidateStatus = "all",
): Promise<MemoryCandidate[]> {
  return request(`/api/v1/memory-candidates?filter=${encodeURIComponent(filter)}`);
}

export function extractMemoryCandidateFromMessage(input: {
  conversationId: string;
  messageId: string;
}): Promise<{ candidate: MemoryCandidate | null; created: boolean }> {
  return request("/api/v1/memory-candidates/extract", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmMemoryCandidate(
  id: string,
  content: string,
  expectedVersion: number,
): Promise<MemoryCandidate> {
  return request(`/api/v1/memory-candidates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "confirm", content, expectedVersion }),
  });
}

export function rejectMemoryCandidate(
  id: string,
  expectedVersion: number,
): Promise<MemoryCandidate> {
  return request(`/api/v1/memory-candidates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "reject", expectedVersion }),
  });
}
