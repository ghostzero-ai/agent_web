import { describe, expect, it, vi } from "vitest";
import { createModelCredentialApi } from "@/lib/api/modelCredentialApi";
import { CredentialCipherError } from "@/lib/ai/server/credentialCipher";

const publicStatus = {
  configured: true,
  source: "stored" as const,
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash-vision-exp",
  apiKeyHint: "••••1234",
  version: 1,
  missing: [],
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/v1/model/credentials", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Model Credential API", () => {
  it("returns only public status after saving a credential", async () => {
    const save = vi.fn().mockResolvedValue(publicStatus);
    const api = createModelCredentialApi({
      getStatus: vi.fn().mockResolvedValue(publicStatus),
      save,
      delete: vi.fn().mockResolvedValue(true),
      test: vi.fn().mockResolvedValue({
        connected: true,
        modelAvailable: true,
      }),
    });

    const response = await api.put(
      request({
        apiKey: "sk-private-value",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash-vision-exp",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(save).toHaveBeenCalledWith({
      apiKey: "sk-private-value",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash-vision-exp",
    });
    expect(body.data).toEqual(publicStatus);
    expect(JSON.stringify(body)).not.toContain("sk-private-value");
  });

  it("rejects unknown fields and reports missing server encryption safely", async () => {
    const api = createModelCredentialApi({
      getStatus: vi.fn().mockResolvedValue(publicStatus),
      save: vi
        .fn()
        .mockRejectedValue(new CredentialCipherError("secret details")),
      delete: vi.fn().mockResolvedValue(false),
      test: vi.fn().mockResolvedValue({
        connected: true,
        modelAvailable: true,
      }),
    });

    const invalid = await api.put(
      request({
        apiKey: "sk-private-value",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "model",
        userId: "forbidden",
      }),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_REQUEST");

    const unavailable = await api.put(
      request({
        apiKey: "sk-private-value",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "model",
      }),
    );
    const body = await unavailable.json();
    expect(unavailable.status).toBe(503);
    expect(body.error.code).toBe("CREDENTIAL_STORE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("secret details");
  });

  it("rejects HTTP and embedded URL credentials as client input", async () => {
    const save = vi.fn().mockResolvedValue(publicStatus);
    const api = createModelCredentialApi({
      getStatus: vi.fn().mockResolvedValue(publicStatus),
      save,
      delete: vi.fn().mockResolvedValue(false),
      test: vi.fn().mockResolvedValue({
        connected: true,
        modelAvailable: true,
      }),
    });

    for (const baseUrl of [
      "http://api.deepseek.com",
      "https://user:password@api.deepseek.com",
    ]) {
      const response = await api.put(
        request({
          apiKey: "sk-private-value",
          provider: "deepseek",
          baseUrl,
          model: "model",
        }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects invalid provider identifiers", async () => {
    const save = vi.fn().mockResolvedValue(publicStatus);
    const api = createModelCredentialApi({
      getStatus: vi.fn().mockResolvedValue(publicStatus),
      save,
      delete: vi.fn().mockResolvedValue(false),
      test: vi.fn().mockResolvedValue({ connected: true, modelAvailable: true }),
    });
    const response = await api.put(
      request({
        apiKey: "sk-private-value",
        provider: "deep seek<script>",
        baseUrl: "https://api.deepseek.com",
        model: "model",
      }),
    );
    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
