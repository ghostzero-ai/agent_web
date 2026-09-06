import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createApiKeyHint,
  CredentialCipherError,
  decryptApiKey,
  encryptApiKey,
  readCredentialMasterKey,
} from "@/lib/ai/server/credentialCipher";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credential encryption", () => {
  it("round-trips an API Key without including plaintext in the envelope", () => {
    const key = randomBytes(32);
    const encrypted = encryptApiKey("sk-private-value", key);

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("sk-private-value");
    expect(decryptApiKey(encrypted, key)).toBe("sk-private-value");
    expect(createApiKeyHint("sk-private-value")).toBe("••••alue");
  });

  it("rejects a tampered envelope and an invalid environment key", () => {
    const key = randomBytes(32);
    const encrypted = encryptApiKey("sk-private-value", key);
    const parts = encrypted.split(".");
    parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
    const tampered = parts.join(".");

    expect(() => decryptApiKey(tampered, key)).toThrow(CredentialCipherError);

    vi.stubEnv("CREDENTIAL_MASTER_KEY", "not-a-valid-key");
    expect(() => readCredentialMasterKey()).toThrow(CredentialCipherError);
  });
});
