import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteInboxItem,
  InboxClientError,
  listInboxItems,
  updateInboxStatus,
} from "@/lib/api/inboxClient";

describe("inbox client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the filtered inbox endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: { id: "item-1" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await listInboxItems("unread");
    await updateInboxStatus("item-1", "read");
    await deleteInboxItem("item-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/inbox?filter=unread",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/inbox/item-1",
      expect.objectContaining({ method: "PATCH", body: '{"status":"read"}' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/inbox/item-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("preserves server error information", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { error: { code: "INBOX_ITEM_NOT_FOUND", message: "Missing." } },
          { status: 404 },
        ),
      ),
    );

    await expect(deleteInboxItem("missing")).rejects.toMatchObject({
      name: "InboxClientError",
      code: "INBOX_ITEM_NOT_FOUND",
      status: 404,
    } satisfies Partial<InboxClientError>);
  });
});
