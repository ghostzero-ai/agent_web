import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPushApi } from "@/lib/api/pushApi";
import { encryptPushSecret } from "@/lib/notifications/pushSecretCipher";
import {
  NotificationRepositoryError,
  type NotificationRepositoryPort,
} from "@/lib/repositories/notificationRepository";

const now = new Date("2026-09-12T02:00:00.000Z");
const subscriptionId = "00000000-0000-4000-8000-000000000001";

function repository(
  overrides: Partial<NotificationRepositoryPort> = {},
): NotificationRepositoryPort {
  return {
    getVapidConfiguration: vi.fn().mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000000",
      publicKey: "public-vapid-key",
      encryptedPrivateKey: encryptPushSecret(
        "private-vapid-key",
        "vapid-private-key",
      ),
      subject: "https://example.test",
      encryptionKeyVersion: 1,
      createdAt: now,
      updatedAt: now,
    }),
    saveVapidConfiguration: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000000",
      pushEnabled: false,
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "08:00",
      timezone: "Asia/Shanghai",
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
    updatePreferences: vi.fn(),
    listSubscriptions: vi.fn().mockResolvedValue([]),
    saveSubscription: vi.fn(),
    deleteSubscription: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Push API", () => {
  beforeEach(() => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", randomBytes(32).toString("base64url"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns only public VAPID, preference and subscription state", async () => {
    const response = await createPushApi(repository()).getConfiguration();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({
      publicKey: "public-vapid-key",
      preferences: { pushEnabled: false, quietStart: "22:00", version: 1 },
      subscriptions: [],
    });
    expect(JSON.stringify(body)).not.toContain("private-vapid-key");
    expect(JSON.stringify(body)).not.toContain("encryptedPrivateKey");
    expect(JSON.stringify(body)).not.toContain("userId");
  });

  it("validates and encrypts a saved browser subscription", async () => {
    const saveSubscription = vi.fn().mockImplementation(async (input) => ({
      id: subscriptionId,
      userId: "local-user",
      ...input,
      status: "active",
      failureCount: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    const api = createPushApi(repository({ saveSubscription }));
    const request = jsonRequest("/api/v1/push/subscriptions", {
      subscription: {
        endpoint: "https://push.example.test/device-token",
        expirationTime: null,
        keys: { p256dh: "browser_public_key", auth: "auth_secret" },
      },
      deviceLabel: "Edge · Windows",
    });
    const response = await api.saveSubscription(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        encryptedSubscription: expect.not.stringContaining("device-token"),
      }),
    );
    expect(body.data).toMatchObject({ id: subscriptionId, deviceLabel: "Edge · Windows" });
    expect(body.data.provider).toBe("web-push");
    expect(JSON.stringify(body)).not.toContain("device-token");

    const invalid = await api.saveSubscription(
      jsonRequest("/api/v1/push/subscriptions", {
        subscription: {
          endpoint: "http://insecure.example.test/push",
          expirationTime: null,
          keys: { p256dh: "key", auth: "auth" },
        },
        deviceLabel: "Bad device",
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("updates quiet hours with version fencing and validates the interval", async () => {
    const updatePreferences = vi.fn().mockResolvedValue({
      pushEnabled: true,
      quietHoursEnabled: true,
      quietStart: "23:00",
      quietEnd: "07:00",
      timezone: "Asia/Shanghai",
      version: 2,
    });
    const api = createPushApi(repository({ updatePreferences }), () => now);
    const response = await api.updatePreferences(
      jsonRequest("/api/v1/push/preferences", {
        pushEnabled: true,
        quietHoursEnabled: true,
        quietStart: "23:00",
        quietEnd: "07:00",
        expectedVersion: 1,
      }),
    );
    expect(response.status).toBe(200);
    expect(updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1, now }),
    );

    const invalid = await api.updatePreferences(
      jsonRequest("/api/v1/push/preferences", {
        pushEnabled: true,
        quietHoursEnabled: true,
        quietStart: "22:00",
        quietEnd: "22:00",
        expectedVersion: 2,
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("maps conflicts and missing subscriptions without exposing internals", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const conflict = createPushApi(repository({
      updatePreferences: vi.fn().mockRejectedValue(
        new NotificationRepositoryError(
          "PREFERENCE_VERSION_CONFLICT",
          "Notification preferences changed in another client.",
        ),
      ),
    }));
    const conflictResponse = await conflict.updatePreferences(
      jsonRequest("/api/v1/push/preferences", {
        pushEnabled: false,
        quietHoursEnabled: false,
        quietStart: "22:00",
        quietEnd: "08:00",
        expectedVersion: 1,
      }),
    );
    expect(conflictResponse.status).toBe(409);
    expect((await conflictResponse.json()).error.code).toBe(
      "PREFERENCE_VERSION_CONFLICT",
    );

    expect((await conflict.deleteSubscription(subscriptionId)).status).toBe(404);
    const unavailable = createPushApi(() => {
      throw new Error("secret database connection");
    });
    const failed = await unavailable.getConfiguration();
    const body = await failed.json();
    expect(failed.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret database connection");
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
