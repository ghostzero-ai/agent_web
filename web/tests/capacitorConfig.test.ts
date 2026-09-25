import { afterEach, describe, expect, it, vi } from "vitest";

const originalProfile = process.env.CAPACITOR_BUILD_PROFILE;
const originalServerUrl = process.env.CAPACITOR_SERVER_URL;

afterEach(() => {
  if (originalProfile === undefined) delete process.env.CAPACITOR_BUILD_PROFILE;
  else process.env.CAPACITOR_BUILD_PROFILE = originalProfile;
  if (originalServerUrl === undefined) delete process.env.CAPACITOR_SERVER_URL;
  else process.env.CAPACITOR_SERVER_URL = originalServerUrl;
  vi.resetModules();
});

describe("Capacitor mobile foundation config", () => {
  it("uses the packaged React client without an explicit remote server", async () => {
    delete process.env.CAPACITOR_BUILD_PROFILE;
    delete process.env.CAPACITOR_SERVER_URL;
    vi.resetModules();

    const { default: config } = await import("../capacitor.config");

    expect(config.appId).toBe("com.ghostzero.aistudycompanion");
    expect(config.webDir).toBe("mobile-dist");
    expect(config.plugins.LocalNotifications).toEqual({
      smallIcon: "ic_stat_ai_reminder",
      iconColor: "#2563EB",
    });
    expect(config).not.toHaveProperty("server");
  });

  it("accepts an HTTPS server only for the explicit spike profile", async () => {
    process.env.CAPACITOR_BUILD_PROFILE = "spike";
    process.env.CAPACITOR_SERVER_URL =
      "https://laptop.example-tailnet.ts.net/chat";
    vi.resetModules();

    const { default: config } = await import("../capacitor.config");

    expect(config).toMatchObject({
      webDir: "mobile-shell",
      server: {
        url: "https://laptop.example-tailnet.ts.net/chat",
        cleartext: false,
      },
    });
  });

  it("rejects accidentally using the remote shell outside a spike", async () => {
    process.env.CAPACITOR_BUILD_PROFILE = "release";
    process.env.CAPACITOR_SERVER_URL = "https://example.com/chat";
    vi.resetModules();

    await expect(import("../capacitor.config")).rejects.toThrow(
      "Remote Capacitor content is restricted",
    );
  });
});
