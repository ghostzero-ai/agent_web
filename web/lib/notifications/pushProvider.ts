export type PushNotification = {
  title: string;
  body: string;
  inboxItemId: string;
};

export type PushProviderInput = {
  encryptedSubscription: string;
  notification: PushNotification;
};

export type PushProviderOutcome =
  | { status: "sent" }
  | { status: "expired"; errorCode: string }
  | { status: "failed"; errorCode: string; retryable: boolean };

export interface PushNotificationProvider {
  readonly id: string;
  send(input: PushProviderInput): Promise<PushProviderOutcome>;
}

export class PushProviderRegistry {
  private readonly providers = new Map<string, PushNotificationProvider>();

  constructor(providers: PushNotificationProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.id)) {
        throw new Error(`Duplicate Push provider: ${provider.id}`);
      }
      this.providers.set(provider.id, provider);
    }
  }

  async send(providerId: string, input: PushProviderInput): Promise<PushProviderOutcome> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        status: "failed",
        errorCode: "PUSH_PROVIDER_UNAVAILABLE",
        retryable: false,
      };
    }
    return provider.send(input);
  }
}
