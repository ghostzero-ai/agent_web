import { expect, test } from "@playwright/test";
import { summarizeModelCalls, type ModelCallTelemetry } from "../lib/ai/modelUsage";

test("shows measured cache coverage and unknown cost on mobile without generating an answer", async ({ page }) => {
  let modelRequests = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/model/credentials", (route) => route.fulfill({ json: { data: { configured: false, source: "none", provider: null, baseUrl: null, model: null, apiKeyHint: null, version: null, missing: [] } } }));
  await page.route("**/api/v1/model/stream", (route) => { modelRequests++; return route.fulfill({ status: 500 }); });
  const call: ModelCallTelemetry = { id: "11111111-1111-4111-8111-111111111111", business: "chat", providerOrigin: "https://api.deepseek.com", model: "mock-model", startedAt: "2026-10-01T00:00:00.000Z", status: "completed", attempts: 1, durationMs: 30, firstTokenMs: 10, usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 80, uncachedInputTokens: 20, reasoningTokens: null }, finishReason: "stop", errorCode: null, price: null, estimatedCost: null };
  const unknown: ModelCallTelemetry = { ...call, id: "22222222-2222-4222-8222-222222222222", usage: null, status: "cancelled" };
  await page.route("**/api/v1/model/usage", (route) => route.fulfill({ json: { data: { since: "2026-09-24T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z", recordedCalls: 2, truncated: false, groups: summarizeModelCalls([call, unknown]) } } }));
  await page.goto("/api-key");
  const panel = page.getByRole("region", { name: "Token 与费用" });
  await panel.getByRole("button", { name: "查看/刷新用量" }).click();
  await expect(panel).toContainText("命中率 80.0%");
  await expect(panel).toContainText("输入用量覆盖 1/2");
  await expect(panel).toContainText("计价覆盖 0/2");
  await expect(panel).toContainText("未知（未配置对应价格或缺少用量）");
  expect(modelRequests).toBe(0);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("distinguishes an empty usage history from a failed refresh", async ({ page }) => {
  await page.route("**/api/v1/model/credentials", (route) => route.fulfill({ json: { data: { configured: false, source: "none", provider: null, baseUrl: null, model: null, apiKeyHint: null, version: null, missing: [] } } }));
  let reads = 0;
  await page.route("**/api/v1/model/usage", (route) => ++reads === 1
    ? route.fulfill({ json: { data: { since: "2026-09-24T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z", recordedCalls: 0, truncated: false, groups: [] } } })
    : route.fulfill({ status: 503, json: { error: { message: "Unavailable" } } }));
  await page.goto("/api-key");
  const panel = page.getByRole("region", { name: "Token 与费用" });
  await panel.getByRole("button", { name: "查看/刷新用量" }).click();
  await expect(panel).toContainText("暂无记录");
  await panel.getByRole("button", { name: "查看/刷新用量" }).click();
  await expect(panel.getByRole("alert")).toContainText("暂时无法读取模型用量");
});
