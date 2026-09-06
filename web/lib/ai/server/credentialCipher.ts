import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const AAD = Buffer.from("agent-web:model-credential:v1", "utf8");

export class CredentialCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCipherError";
  }
}

export function readCredentialMasterKey(): Buffer {
  const encoded = process.env.CREDENTIAL_MASTER_KEY?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new CredentialCipherError(
      "CREDENTIAL_MASTER_KEY must be a 32-byte base64url value.",
    );
  }

  const key = Buffer.from(encoded, "base64url");
  if (key.length !== KEY_BYTES) {
    throw new CredentialCipherError(
      "CREDENTIAL_MASTER_KEY must decode to exactly 32 bytes.",
    );
  }
  return key;
}

export function encryptApiKey(apiKey: string, key = readCredentialMasterKey()): string {
  if (!apiKey) throw new CredentialCipherError("API Key must not be empty.");
  if (key.length !== KEY_BYTES) {
    throw new CredentialCipherError("Credential encryption key is invalid.");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptApiKey(
  envelope: string,
  key = readCredentialMasterKey(),
): string {
  if (key.length !== KEY_BYTES) {
    throw new CredentialCipherError("Credential encryption key is invalid.");
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext, extra] =
    envelope.split(".");
  if (
    version !== ENVELOPE_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext ||
    extra !== undefined
  ) {
    throw new CredentialCipherError("Encrypted credential envelope is invalid.");
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const authTag = Buffer.from(encodedAuthTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("Invalid envelope lengths.");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new CredentialCipherError("Encrypted credential could not be decrypted.");
  }
}

export function createApiKeyHint(apiKey: string): string {
  const visible = apiKey.slice(-4);
  return `••••${visible}`;
}
