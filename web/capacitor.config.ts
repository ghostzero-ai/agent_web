import { normalizeMobileServerUrl } from "./lib/platform/mobileServerUrl";

const serverUrl = normalizeMobileServerUrl(process.env.CAPACITOR_SERVER_URL);
const buildProfile = process.env.CAPACITOR_BUILD_PROFILE?.trim();

if (serverUrl && buildProfile !== "spike") {
  throw new Error(
    "Remote Capacitor content is restricted to CAPACITOR_BUILD_PROFILE=spike.",
  );
}

const config = {
  appId: "com.ghostzero.aistudycompanion",
  appName: "AI Study Companion",
  webDir: "mobile-shell",
  loggingBehavior: "debug",
  android: {
    minWebViewVersion: 60,
    minHuaweiWebViewVersion: 10,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_ai_reminder",
      iconColor: "#2563EB",
    },
  },
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: false,
        },
      }
    : {}),
};

export default config;
