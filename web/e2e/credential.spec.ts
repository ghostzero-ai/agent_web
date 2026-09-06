import { expect, test } from "@playwright/test";

test("tests, saves and deletes a write-only model credential", async ({
  page,
}) => {
  let stored = false;
  let receivedApiKey: string | null = null;

  await page.route("**/api/v1/model/credentials**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    const status = {
      configured: stored,
      source: stored ? "stored" : "none",
      provider: stored ? "openai-compatible" : null,
      baseUrl: stored ? "https://api.deepseek.com" : null,
      model: stored ? "deepseek-v4-flash-vision-exp" : null,
      apiKeyHint: stored ? "••••alue" : null,
      version: stored ? 1 : null,
      missing: stored ? [] : ["AI_API_KEY"],
    };

    if (pathname.endsWith("/test") && request.method() === "POST") {
      receivedApiKey = request.postDataJSON().apiKey;
      return respond({ connected: true, modelAvailable: true });
    }
    if (request.method() === "PUT") {
      receivedApiKey = request.postDataJSON().apiKey;
      stored = true;
      return respond({ ...status, configured: true, source: "stored", apiKeyHint: "••••alue" });
    }
    if (request.method() === "DELETE") {
      stored = false;
      return route.fulfill({ status: 204, body: "" });
    }
    return respond(status);
  });

  await page.goto("/api-key");
  const apiKey = page.getByLabel("API Key");
  await apiKey.fill("sk-private-value");

  await page.getByRole("button", { name: "测试连接" }).click();
  await expect(page.getByText("连接成功，目标模型当前可用。")).toBeVisible();
  expect(receivedApiKey).toBe("sk-private-value");

  await page.getByRole("button", { name: "加密保存" }).click();
  await expect(page.getByText("服务端加密存储")).toBeVisible();
  await expect(page.getByText("••••alue")).toBeVisible();
  await expect(apiKey).toHaveValue("");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(window.localStorage).some((value) =>
          value.includes("sk-private-value"),
        ),
      ),
    )
    .toBe(false);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除凭据" }).click();
  await expect(page.getByText("服务端凭据已删除。")).toBeVisible();
  await expect(page.getByText("未配置")).toBeVisible();
});
