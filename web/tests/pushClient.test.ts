import { afterEach, describe, expect, it, vi } from "vitest";
import {
  base64UrlToUint8Array,
  browserDeviceLabel,
  deletePushSubscription,
  getPushState,
  PushClientError,
  saveBrowserSubscription,
  updateNotificationPreferences,
} from "@/lib/api/pushClient";

describe("push client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses versioned Push configuration, subscription and preference endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: { publicKey: "key" } }))
      .mockResolvedValueOnce(Response.json({ data: { id: "subscription-1" } }))
      .mockResolvedValueOnce(Response.json({ data: { version: 2 } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await getPushState();
    await saveBrowserSubscription(
      {
        endpoint: "https://push.example.test/one",
        expirationTime: null,
        keys: { p256dh: "key", auth: "auth" },
      },
      "Edge · Windows",
    );
    await updateNotificationPreferences({
      pushEnabled: true,
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "08:00",
      expectedVersion: 1,
    });
    await deletePushSubscription("subscription-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/push/config",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/push/subscriptions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/push/preferences",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/push/subscriptions/subscription-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("preserves stable API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { error: { code: "PREFERENCE_VERSION_CONFLICT", message: "Changed." } },
          { status: 409 },
        ),
      ),
    );
    await expect(getPushState()).rejects.toMatchObject({
      name: "PushClientError",
      code: "PREFERENCE_VERSION_CONFLICT",
      status: 409,
    } satisfies Partial<PushClientError>);
  });

  it("decodes VAPID keys and creates bounded device labels", () => {
    vi.stubGlobal("window", { atob: (value: string) => Buffer.from(value, "base64").toString("binary") });
    expect(Array.from(base64UrlToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4]);
    expect(browserDeviceLabel("Mozilla/5.0 (Windows NT 10.0) Edg/140.0")).toBe(
      "Edge · Windows",
    );
    expect(browserDeviceLabel("Mozilla/5.0 (iPhone) Version/18 Safari/605.1")).toBe(
      "Safari · iPhone/iPad",
    );
  });
});
