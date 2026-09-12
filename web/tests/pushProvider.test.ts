import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { huaweiPushV3Endpoint } from "@/lib/notifications/huaweiPushContract";
import { PushProviderRegistry } from "@/lib/notifications/pushProvider";
import { encryptPushSecret } from "@/lib/notifications/pushSecretCipher";
import { createWebPushProvider } from "@/lib/notifications/webPushProvider";

const INBOX_ID = "10000000-0000-4000-8000-000000000001";

function encryptedWebSubscription(): string {
  return encryptPushSecret(
    JSON.stringify({
      endpoint: "https://push.example.test/private-token",
      expirationTime: null,
      keys: { p256dh: "public-client-key", auth: "auth-secret" },
    }),
    "subscription",
  );
}

const notification = {
  title: "学习提醒",
  body: "你有一条新的任务提醒，点击查看。",
  inboxItemId: INBOX_ID,
};

describe("Push providers", () => {
  beforeEach(() => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", randomBytes(32).toString("base64url"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("routes by provider id and rejects duplicate registrations", async () => {
    const send = vi.fn().mockResolvedValue({ status: "sent" as const });
    const registry = new PushProviderRegistry([{ id: "web-push", send }]);

    await expect(registry.send("web-push", {
      encryptedSubscription: "encrypted",
      notification,
    })).resolves.toEqual({ status: "sent" });
    await expect(registry.send("not-installed", {
      encryptedSubscription: "encrypted",
      notification,
    })).resolves.toEqual({
      status: "failed",
      errorCode: "PUSH_PROVIDER_UNAVAILABLE",
      retryable: false,
    });
    expect(() => new PushProviderRegistry([
      { id: "duplicate", send },
      { id: "duplicate", send },
    ])).toThrow("Duplicate Push provider");
  });

  it("keeps Web Push protocol details inside the Web provider", async () => {
    const sendPush = vi.fn().mockResolvedValue({ statusCode: 201 });
    const configuration = {
      publicKey: "public-vapid",
      privateKey: "private-vapid",
      subject: "https://example.test",
    };
    const provider = createWebPushProvider(
      vi.fn().mockResolvedValue(configuration),
      sendPush,
    );

    await expect(provider.send({
      encryptedSubscription: encryptedWebSubscription(),
      notification,
    })).resolves.toEqual({ status: "sent" });
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.test/private-token" }),
      JSON.stringify(notification),
      expect.objectContaining({
        TTL: 86_400,
        topic: INBOX_ID.replaceAll("-", "").slice(0, 32),
        vapidDetails: configuration,
      }),
    );
  });

  it.each([
    [410, { status: "expired", errorCode: "PUSH_SUBSCRIPTION_EXPIRED" }],
    [503, { status: "failed", errorCode: "PUSH_HTTP_503", retryable: true }],
  ])("maps Web Push HTTP %s failures", async (statusCode, expected) => {
    const provider = createWebPushProvider(
      vi.fn().mockResolvedValue({
        publicKey: "public-vapid",
        privateKey: "private-vapid",
        subject: "https://example.test",
      }),
      vi.fn().mockRejectedValue({ statusCode }),
    );
    await expect(provider.send({
      encryptedSubscription: encryptedWebSubscription(),
      notification,
    })).resolves.toEqual(expected);
  });

  it("reserves the documented Huawei HarmonyOS V3 endpoint", () => {
    expect(huaweiPushV3Endpoint("project_123")).toBe(
      "https://push-api.cloud.huawei.com/v3/project_123/messages:send",
    );
    expect(() => huaweiPushV3Endpoint("../unsafe")).toThrow(
      "unsupported characters",
    );
  });
});
