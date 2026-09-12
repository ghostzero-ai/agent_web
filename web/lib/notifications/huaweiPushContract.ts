import type { PushNotificationProvider } from "@/lib/notifications/pushProvider";

export const HUAWEI_PUSH_PROVIDER_ID = "huawei-push";

export type HuaweiPushSubscription = {
  token: string;
  appId: string;
};

export type HuaweiPushServerConfiguration = {
  projectId: string;
  serviceAccountId: string;
  encryptedPrivateKey: string;
  keyId: string;
};

export interface HuaweiPushProvider extends PushNotificationProvider {
  readonly id: typeof HUAWEI_PUSH_PROVIDER_ID;
}

export function huaweiPushV3Endpoint(projectId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    throw new Error("Huawei Push project id contains unsupported characters.");
  }
  return `https://push-api.cloud.huawei.com/v3/${projectId}/messages:send`;
}
