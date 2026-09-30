import { expect, test } from "@playwright/test";

test("discovers and toggles first-party plugin foundations on mobile", async ({
  page,
}) => {
  let enabled = false;
  let version = 0;
  let granted = false;
  let grantVersion = 0;
  const plugin = () => ({
    manifest: {
      schemaVersion: "1",
      id: "study.memorization",
      name: "背书训练",
      description: "把学习材料拆成可校对的知识单元。",
      version: "1.0.0",
      pluginApiVersion: ">=1.0.0 <2.0.0",
      kind: "activity",
      source: "first-party",
      availability: "available",
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
      hostApiVersion: "1.0.0",
      reason: null,
    },
    installation: {
      status: enabled ? "enabled" : "disabled",
      enabled,
      installedVersion: version ? "1.0.0" : null,
      version,
      updateAvailable: false,
      updatedAt: version ? "2026-09-28T05:00:00.000Z" : null,
    },
  });
  const capabilityDashboard = () => ({
    pluginId: "study.memorization",
    pluginVersion: "1.0.0",
    pluginEnabled: enabled,
    capabilities: ["model.generate", "storage.read-write"].map((id, index) => ({
      id,
      name: index === 0 ? "受控模型生成" : "插件隔离存储",
      description: "只能通过宿主受控接口使用。",
      risk: index === 0 ? "compute" : "private-storage",
      adapterStatus: index === 0 ? "planned" : "available",
      grant: {
        status: granted && index === 0 ? "granted" : "revoked",
        effective: enabled && granted && index === 0,
        version: index === 0 ? grantVersion : 0,
        reviewedPluginVersion: granted && index === 0 ? "1.0.0" : null,
        requiresReview: false,
      },
      quota: {
        used: 0,
        limit: index === 0 ? 40 : 500,
        remaining: index === 0 ? 40 : 500,
        resetsAt: "2026-09-29T00:00:00.000Z",
      },
    })),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/plugins", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [plugin()] }),
    }),
  );
  await page.route("**/api/v1/plugins/study.memorization/capabilities", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: capabilityDashboard() }),
    }),
  );
  await page.route("**/api/v1/plugins/study.memorization/audit?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: granted
          ? [{
              id: "audit-1",
              requestId: "request-1",
              pluginId: "study.memorization",
              capabilityId: "model.generate",
              operation: "authorization.grant",
              execution: "authorization",
              runId: null,
              outcome: "succeeded",
              errorCode: null,
              units: 0,
              durationMs: null,
              createdAt: "2026-09-28T05:00:00.000Z",
              completedAt: "2026-09-28T05:00:00.000Z",
            }]
          : [],
      }),
    }),
  );
  await page.route("**/api/v1/plugins/study.memorization/capabilities/model.generate/grant", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.expectedVersion).toBe(grantVersion);
    granted = true;
    grantVersion += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: capabilityDashboard() }),
    });
  });
  await page.route(/\/api\/v1\/plugins\/study\.memorization\/(enable|disable)$/, async (route) => {
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
  await expect(page.getByRole("heading", { name: "活动插件" })).toBeVisible();
  await expect(page.getByText("Plugin API v1", { exact: false })).toBeVisible();
  await expect(page.getByText("v1.0.0", { exact: true })).toBeVisible();
  await expect(page.getByText("启用本身不会自动授权")).toBeVisible();
  await page.getByRole("button", { name: "启用插件" }).click();
  await expect(page.getByRole("status")).toContainText("逐项审核");
  await expect(page.getByText("已启用", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开背书训练" }))
    .toHaveAttribute("href", "/study/memorization");
  await page.getByRole("button", { name: "授权" }).first().click();
  await expect(page.getByRole("status")).toContainText("调用仍受每日配额和审计约束");
  await expect(page.getByText("今日 0/40 次 · 已生效")).toBeVisible();
  await page.getByRole("button", { name: "禁用插件" }).click();
  await expect(page.getByRole("status")).toContainText("已禁用");
});
