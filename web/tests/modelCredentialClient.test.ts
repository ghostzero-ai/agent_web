import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteModelCredential,
  getModelCredentialStatus,
  ModelCredentialClientError,
  saveModelCredential,
  testModelCredential,
} from "@/lib/api/modelCredentialClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

const status = {
  configured: true,
  source: "stored",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash-vision-exp",
  apiKeyHint: "••••1234",
  version: 1,
  missing: [],
};

describe("model credential browser client", () => {
  it("uses same-origin credential endpoints and keeps the Key out of responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: status }))
      .mockResolvedValueOnce(Response.json({ data: status }))
      .mockResolvedValueOnce(
        Response.json({ data: { connected: true, modelAvailable: true } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      apiKey: "sk-private-value",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash-vision-exp",
    };

    await expect(getModelCredentialStatus()).resolves.toEqual(status);
    await expect(saveModelCredential(input)).resolves.toEqual(status);
    await expect(testModelCredential(input)).resolves.toEqual({
      connected: true,
      modelAvailable: true,
    });
    await expect(deleteModelCredential()).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/model/credentials",
      "/api/v1/model/credentials",
      "/api/v1/model/credentials/test",
      "/api/v1/model/credentials",
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify(input),
    });
    expect(JSON.stringify(status)).not.toContain("sk-private-value");
  });

  it("maps safe API errors for the settings page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "PROVIDER_AUTH_FAILED",
              message: "The provider rejected the API Key.",
              retryable: false,
            },
          },
          { status: 422 },
        ),
      ),
    );

    await expect(
      testModelCredential({
        apiKey: "sk-wrong-value",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "model",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ModelCredentialClientError",
        code: "PROVIDER_AUTH_FAILED",
        retryable: false,
      } satisfies Partial<ModelCredentialClientError>),
    );
  });
});
