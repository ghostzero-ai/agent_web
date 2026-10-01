"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { reconcileLocalTaskNotificationsWithFallback } from "@/lib/notifications/localNotificationReliability";
import {
  getCapacitorLocalNotificationAdapter,
  isCapacitorAndroid,
  localNotificationDeepLink,
} from "@/lib/platform/capacitorLocalNotifications";
import { navigateToAppPath } from "@/lib/platform/appNavigation";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";

async function reconcileOnResume(): Promise<void> {
  const adapter = getCapacitorLocalNotificationAdapter();
  if (!adapter || (await adapter.checkPermission()) !== "granted") return;
  await reconcileLocalTaskNotificationsWithFallback(adapter);
}

export function NativeNotificationBridge() {
  useEffect(() => {
    if (!isCapacitorAndroid()) return;

    let disposed = false;
    const removers: Array<() => Promise<void>> = [];
    void App.addListener("backButton", ({ canGoBack }) => {
      if (!window.dispatchEvent(new Event("companion:back", { cancelable: true }))) return;
      if (!requestNavigationPermission()) return;
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removers.push(() => handle.remove());
    });
    void LocalNotifications.addListener(
      "localNotificationActionPerformed",
      ({ notification }) => {
        const deepLink = localNotificationDeepLink(notification);
        if (deepLink) navigateToAppPath(deepLink);
      },
    ).then((handle) => {
      if (disposed) void handle.remove();
      else removers.push(() => handle.remove());
    });
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void reconcileOnResume().catch((error: unknown) => {
          console.warn("Local task notification resume sync failed.", error);
        });
      }
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removers.push(() => handle.remove());
    });
    void reconcileOnResume().catch((error: unknown) => {
      console.warn("Local task notification startup sync failed.", error);
    });

    return () => {
      disposed = true;
      for (const remove of removers) void remove();
    };
  }, []);

  return null;
}
