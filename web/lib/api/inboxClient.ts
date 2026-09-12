export type InboxStatus = "unread" | "read";
export type InboxFilter = "all" | InboxStatus;

export type InboxItem = {
  id: string;
  taskId: string | null;
  taskRunId: string | null;
  source: "reminder" | "agent_prompt";
  title: string;
  body: string | null;
  occurredAt: string;
  status: InboxStatus;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class InboxClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InboxClientError";
  }
}

async function inboxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new InboxClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as { data: T };
  return body.data;
}

export function listInboxItems(filter: InboxFilter = "all"): Promise<InboxItem[]> {
  return inboxRequest(`/api/v1/inbox?filter=${encodeURIComponent(filter)}`);
}

export function updateInboxStatus(
  id: string,
  status: InboxStatus,
): Promise<InboxItem> {
  return inboxRequest(`/api/v1/inbox/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteInboxItem(id: string): Promise<void> {
  return inboxRequest(`/api/v1/inbox/${id}`, { method: "DELETE" });
}
