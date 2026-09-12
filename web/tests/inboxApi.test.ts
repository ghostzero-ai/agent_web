import { describe, expect, it, vi } from "vitest";
import { createInboxApi } from "@/lib/api/inboxApi";
import {
  InboxRepositoryError,
  type InboxRepositoryPort,
} from "@/lib/repositories/inboxRepository";

const itemId = "00000000-0000-4000-8000-000000000001";

function repository(overrides: Partial<InboxRepositoryPort> = {}): InboxRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    markStatus: vi.fn(),
    delete: vi.fn().mockResolvedValue(false),
    completeReminderRun: vi.fn(),
    completeAgentPromptRun: vi.fn(),
    ...overrides,
  };
}

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/inbox/${itemId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Inbox API", () => {
  it("lists a validated filter and returns no-store responses", async () => {
    const list = vi.fn().mockResolvedValue([{ id: itemId, status: "unread" }]);
    const api = createInboxApi(repository({ list }));
    const response = await api.list("unread");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect((await response.json()).data).toHaveLength(1);
    expect(list).toHaveBeenCalledWith("unread");
    expect((await api.list("unknown")).status).toBe(400);
  });

  it("updates status and reports missing deletes with a stable error", async () => {
    const now = new Date("2026-09-10T02:00:00.000Z");
    const markStatus = vi.fn().mockResolvedValue({ id: itemId, status: "read" });
    const api = createInboxApi(repository({ markStatus }), () => now);
    const updated = await api.update(itemId, patchRequest({ status: "read" }));

    expect(updated.status).toBe(200);
    expect(markStatus).toHaveBeenCalledWith(itemId, "read", now);
    const missing = await api.delete(itemId);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toMatchObject({
      code: "INBOX_ITEM_NOT_FOUND",
      retryable: false,
    });
  });

  it("maps repository errors and hides internal details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const missingApi = createInboxApi(repository({
      markStatus: vi.fn().mockRejectedValue(
        new InboxRepositoryError("INBOX_ITEM_NOT_FOUND", "Inbox item was not found."),
      ),
    }));
    expect((await missingApi.update(itemId, patchRequest({ status: "read" }))).status).toBe(404);

    const unavailable = createInboxApi(() => {
      throw new Error("secret database detail");
    });
    const response = await unavailable.list(null);
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret database detail");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
