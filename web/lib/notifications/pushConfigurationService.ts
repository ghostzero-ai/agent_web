import webPush from "web-push";
import {
  decryptPushSecret,
  encryptPushSecret,
} from "@/lib/notifications/pushSecretCipher";
import {
  pushEndpointHash,
  type NotificationRepositoryPort,
} from "@/lib/repositories/notificationRepository";

const DEFAULT_VAPID_SUBJECT = "https://github.com/ghostzero-ai/agent_web";

export type BrowserPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

export type PushConfiguration = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function createPushConfigurationService(
  repository: NotificationRepositoryPort,
) {
  async function getOrCreateConfiguration(): Promise<PushConfiguration> {
    let stored = await repository.getVapidConfiguration();
    if (!stored) {
      const generated = webPush.generateVAPIDKeys();
      stored = await repository.saveVapidConfiguration({
        publicKey: generated.publicKey,
        encryptedPrivateKey: encryptPushSecret(
          generated.privateKey,
          "vapid-private-key",
        ),
        subject: process.env.VAPID_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT,
        encryptionKeyVersion: 1,
      });
    }
    return {
      publicKey: stored.publicKey,
      privateKey: decryptPushSecret(
        stored.encryptedPrivateKey,
        "vapid-private-key",
      ),
      subject: stored.subject,
    };
  }

  return {
    getOrCreateConfiguration,

    async getPublicState() {
      const [configuration, preferences, subscriptions] = await Promise.all([
        getOrCreateConfiguration(),
        repository.getPreferences(),
        repository.listSubscriptions(),
      ]);
      return {
        publicKey: configuration.publicKey,
        preferences: {
          pushEnabled: preferences.pushEnabled,
          quietHoursEnabled: preferences.quietHoursEnabled,
          quietStart: preferences.quietStart,
          quietEnd: preferences.quietEnd,
          timezone: preferences.timezone,
          version: preferences.version,
        },
        subscriptions: subscriptions.map((subscription) => ({
          id: subscription.id,
          deviceLabel: subscription.deviceLabel,
          status: subscription.status,
          failureCount: subscription.failureCount,
          expiresAt: subscription.expiresAt,
          lastSuccessAt: subscription.lastSuccessAt,
          lastFailureAt: subscription.lastFailureAt,
          createdAt: subscription.createdAt,
        })),
      };
    },

    saveSubscription(
      subscription: BrowserPushSubscription,
      deviceLabel: string,
    ) {
      return repository.saveSubscription({
        endpointHash: pushEndpointHash(subscription.endpoint),
        encryptedSubscription: encryptPushSecret(
          JSON.stringify(subscription),
          "subscription",
        ),
        deviceLabel,
        expiresAt:
          subscription.expirationTime === null
            ? null
            : new Date(subscription.expirationTime),
      });
    },
  };
}
