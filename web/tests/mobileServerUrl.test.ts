import { describe, expect, it } from "vitest";
import {
  MobileServerUrlError,
  normalizeMobileServerUrl,
} from "@/lib/platform/mobileServerUrl";

describe("mobile server URL", () => {
  it("accepts an HTTPS Tailscale route and normalizes it", () => {
    expect(
      normalizeMobileServerUrl(
        " https://laptop.example-tailnet.ts.net/chat ",
      ),
    ).toBe("https://laptop.example-tailnet.ts.net/chat");
  });

  it("keeps the offline shell when no remote server is configured", () => {
    expect(normalizeMobileServerUrl(undefined)).toBeUndefined();
    expect(normalizeMobileServerUrl("  ")).toBeUndefined();
  });

  it.each([
    "http://192.168.1.2:3000/chat",
    "https://user:secret@example.com/chat",
    "https://example.com/chat?token=secret",
    "not-a-url",
  ])("rejects unsafe mobile server URL %s", (input) => {
    expect(() => normalizeMobileServerUrl(input)).toThrow(
      MobileServerUrlError,
    );
  });
});
