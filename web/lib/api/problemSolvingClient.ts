import { apiFetch } from "@/lib/api/clientRuntime";
import type {
  ProblemAttempt,
  ProblemCase,
  ProblemCaseSummary,
  ProblemStrategy,
  ReviewCard,
} from "@/lib/problemSolving/domain";
import type { ProblemTaskDraft } from "@/lib/problemSolving/service";

export class ProblemSolvingClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProblemSolvingClientError";
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
    throw new ProblemSolvingClientError(
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

export function listProblemCases(): Promise<ProblemCaseSummary[]> {
  return request("/api/v1/problem-solving");
}

export function createProblemCase(input: {
  title: string;
  problemText: string;
  image: { dataUrl: string; name: string } | null;
}): Promise<{ problemCase: ProblemCase; storageVersion: number }> {
  return request("/api/v1/problem-solving", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProblemCase(id: string): Promise<{
  problemCase: ProblemCase;
  storageVersion: number;
}> {
  return request(`/api/v1/problem-solving/${encodeURIComponent(id)}`);
}

export function deleteProblemCase(id: string, expectedVersion: number): Promise<void> {
  return request(`/api/v1/problem-solving/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function requestProblemResponse(
  id: string,
  input: {
    strategy: ProblemStrategy;
    userAnswer: string | null;
    imageDataUrl: string | null;
    expectedVersion: number;
  },
): Promise<{
  problemCase: ProblemCase;
  storageVersion: number;
  attempt: ProblemAttempt;
}> {
  return request(`/api/v1/problem-solving/${encodeURIComponent(id)}/interactions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createProblemReviewCard(
  id: string,
  attemptId: string,
  expectedVersion: number,
): Promise<{
  problemCase: ProblemCase;
  storageVersion: number;
  card: ReviewCard;
}> {
  return request(`/api/v1/problem-solving/${encodeURIComponent(id)}/review-cards`, {
    method: "POST",
    body: JSON.stringify({ attemptId, expectedVersion }),
  });
}

export function createProblemTaskDraft(
  id: string,
  cardId: string,
  expectedVersion: number,
): Promise<ProblemTaskDraft> {
  return request(`/api/v1/problem-solving/${encodeURIComponent(id)}/task-draft`, {
    method: "POST",
    body: JSON.stringify({ cardId, expectedVersion }),
  });
}
