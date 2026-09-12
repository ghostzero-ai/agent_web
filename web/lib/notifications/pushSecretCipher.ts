import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readCredentialMasterKey } from "@/lib/ai/server/credentialCipher";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type PushSecretPurpose = "subscription" | "vapid-private-key";

export class PushSecretCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushSecretCipherError";
  }
}

function additionalData(purpose: PushSecretPurpose): Buffer {
  return Buffer.from(`agent-web:push:${purpose}:v1`, "utf8");
}

export function encryptPushSecret(
  value: string,
  purpose: PushSecretPurpose,
  key = readCredentialMasterKey(),
): string {
  if (!value) throw new PushSecretCipherError("Push secret must not be empty.");
  if (key.length !== KEY_BYTES) {
    throw new PushSecretCipherError("Push encryption key is invalid.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(additionalData(purpose));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPushSecret(
  envelope: string,
  purpose: PushSecretPurpose,
  key = readCredentialMasterKey(),
): string {
  if (key.length !== KEY_BYTES) {
    throw new PushSecretCipherError("Push encryption key is invalid.");
  }
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
    envelope.split(".");
  if (
    version !== ENVELOPE_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra !== undefined
  ) {
    throw new PushSecretCipherError("Encrypted push secret is invalid.");
  }
  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
      throw new Error("Invalid envelope lengths.");
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(additionalData(purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new PushSecretCipherError("Encrypted push secret could not be decrypted.");
  }
}
