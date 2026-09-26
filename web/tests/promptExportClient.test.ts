import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPromptEnvelope } from "@/lib/api/promptExportClient";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Prompt export client", () => {
  it("asks the server to verify and serialize the envelope", async () => {
    const envelope = await createTestPromptEnvelope();
    const artifact = {
      filename: "prompt.json",
      mediaType: "application/json",
      content: "{}\n",
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: artifact }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exportPromptEnvelope(envelope, "json", false),
    ).resolves.toEqual(artifact);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/model/prompt-export");
    expect(JSON.parse(String(init.body))).toEqual({
      envelope,
      format: "json",
      includeMemory: false,
    });
  });

  it("surfaces the server's stable rejection message", async () => {
    const envelope = await createTestPromptEnvelope();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { message: "Prompt envelope does not match its audit record." } },
          { status: 409 },
        ),
      ),
    );

    await expect(exportPromptEnvelope(envelope, "markdown", true)).rejects.toThrow(
      "Prompt envelope does not match its audit record.",
    );
  });
});
