import { expect, test } from "@playwright/test";

test("discovers and toggles first-party plugin foundations on mobile", async ({
  page,
}) => {
  let enabled = false;
  let version = 0;
  const plugin = () => ({
    manifest: {
      schemaVersion: "1",
      id: "study.memorization",
      name: "背书训练",
      description: "把学习材料拆成可校对的知识单元。",
      version: "0.1.0",
      pluginApiVersion: ">=0.1.0 <0.2.0",
      kind: "activity",
      source: "first-party",
      availability: "foundation",
      contributions: {
        skills: ["memorization.feedback"],
        tools: [],
        activities: ["memorization.review"],
        backgroundJobs: [],
      },
      requestedCapabilities: ["model.generate", "storage.read-write"],
    },
    compatibility: {
      status: "compatible",
      hostApiVersion: "0.1.0",
      reason: null,
    },
    installation: {
      status: enabled ? "enabled" : "disabled",
      enabled,
      installedVersion: version ? "0.1.0" : null,
      version,
      updateAvailable: false,
      updatedAt: version ? "2026-09-28T05:00:00.000Z" : null,
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/plugins", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [plugin()] }),
    }),
  );
  await page.route("**/api/v1/plugins/study.memorization/*", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.expectedVersion).toBe(version);
    enabled = route.request().url().endsWith("/enable");
    version += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: plugin() }),
    });
  });

  await page.goto("/plugins");
  await expect(page.getByRole("heading", { name: "学习插件" })).toBeVisible();
  await expect(page.getByText("声明不等于授权")).toBeVisible();
  await page.getByRole("button", { name: "启用插件基础" }).click();
  await expect(page.getByRole("status")).toContainText("插件基础已启用");
  await expect(page.getByText("已启用插件基础", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "禁用插件基础" }).click();
  await expect(page.getByRole("status")).toContainText("已禁用");
});
