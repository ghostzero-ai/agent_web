import { describe, expect, it, vi } from "vitest";
import { createProblemSolvingApi } from "@/lib/api/problemSolvingApi";
import { PluginCapabilityRepositoryError } from "@/lib/repositories/pluginCapabilityRepository";
import type { ProblemGatewayPort } from "@/lib/problemSolving/service";

function request(body: unknown): Request {
  return new Request("http://localhost/api/v1/problem-solving", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Phase 7.4 problem-solving API", () => {
  it("rejects malformed problem records before invoking a capability", async () => {
    const invoke = vi.fn();
    const api = createProblemSolvingApi({ invoke } as ProblemGatewayPort);

    const response = await api.create(request({
      title: "",
      problemText: "",
      image: null,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("preserves capability denial codes as a forbidden response", async () => {
    const port: ProblemGatewayPort = {
      invoke: vi.fn().mockRejectedValue(
        new PluginCapabilityRepositoryError(
          "PLUGIN_UPDATE_REVIEW_REQUIRED",
          "Review the plugin update.",
        ),
      ),
    };
    const response = await createProblemSolvingApi(port).list();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "PLUGIN_UPDATE_REVIEW_REQUIRED",
        retryable: false,
      },
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
