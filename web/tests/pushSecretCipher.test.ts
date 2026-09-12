import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptPushSecret,
  encryptPushSecret,
  PushSecretCipherError,
} from "@/lib/notifications/pushSecretCipher";

describe("push secret cipher", () => {
  it("encrypts without exposing plaintext and decrypts for the same purpose", () => {
    const key = randomBytes(32);
    const envelope = encryptPushSecret("sensitive endpoint", "subscription", key);
    expect(envelope).not.toContain("sensitive endpoint");
    expect(decryptPushSecret(envelope, "subscription", key)).toBe(
      "sensitive endpoint",
    );
  });

  it("rejects cross-purpose substitution and tampering", () => {
    const key = randomBytes(32);
    const envelope = encryptPushSecret("private key", "vapid-private-key", key);
    expect(() => decryptPushSecret(envelope, "subscription", key)).toThrow(
      PushSecretCipherError,
    );
    expect(() =>
      decryptPushSecret(`${envelope.slice(0, -1)}x`, "vapid-private-key", key),
    ).toThrow(PushSecretCipherError);
  });
});
