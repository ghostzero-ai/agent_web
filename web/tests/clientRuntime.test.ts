import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  configureApiBaseUrl,
  normalizeApiBaseUrl,
  resolveApiUrl,
} from "@/lib/api/clientRuntime";

afterEach(() => {
  configureApiBaseUrl(undefined);
  vi.unstubAllGlobals();
});

describe("shared API client runtime", () => {
  it("keeps relative paths for the Next.js web client", () => {
    configureApiBaseUrl(undefined);
    expect(resolveApiUrl("/api/v1/tasks")).toBe("/api/v1/tasks");
  });

  it("targets an HTTPS server origin for the packaged mobile client", () => {
    expect(configureApiBaseUrl("https://laptop.example.ts.net/")).toBe(
      "https://laptop.example.ts.net",
    );
    expect(resolveApiUrl("/api/v1/tasks?status=active")).toBe(
      "https://laptop.example.ts.net/api/v1/tasks?status=active",
    );
  });

  it("rejects unsafe or ambiguous remote API bases", () => {
    expect(() => normalizeApiBaseUrl("http://example.com")).toThrow("HTTPS");
    expect(() => normalizeApiBaseUrl("https://user@example.com")).toThrow("凭据");
    expect(() => normalizeApiBaseUrl("https://example.com/chat")).toThrow("路径");
    expect(() => resolveApiUrl("https://evil.example/api/v1/tasks")).toThrow(
      "/api/v1",
    );
  });

  it("uses the resolved URL without changing request options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    configureApiBaseUrl("https://laptop.example.ts.net");

    await apiFetch("/api/v1/tasks", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://laptop.example.ts.net/api/v1/tasks",
      { method: "POST" },
    );
  });
});
