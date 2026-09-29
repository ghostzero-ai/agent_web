import { expect, test } from "@playwright/test";

test("completes the memorization activity loop on mobile", async ({ page }) => {
  const material = {
    schemaVersion: 1,
    id: "11111111-1111-4111-8111-111111111111",
    title: "认识论",
    sourceText: "实践是检验真理的唯一标准。",
    units: [{
      id: "22222222-2222-4222-8222-222222222222",
      cue: "真理标准",
      content: "实践是检验真理的唯一标准。",
      reviewCount: 0,
      lastScore: null,
      nextReviewAt: null,
      weakPoints: [],
    }],
    attempts: [],
    createdAt: "2026-09-29T08:00:00.000Z",
    updatedAt: "2026-09-29T08:00:00.000Z",
  };
  let created = false;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/memorization", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      expect(input.units[0].cue).toBe("真理标准");
      created = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { material, storageVersion: 1 } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: created ? [{
          id: material.id,
          title: material.title,
          unitCount: 1,
          reviewedUnitCount: 0,
          averageScore: null,
          nextReviewAt: null,
          updatedAt: material.updatedAt,
        }] : [],
      }),
    });
  });
  await page.route(`**/api/v1/memorization/${material.id}/review`, async (route) => {
    const input = route.request().postDataJSON();
    expect(input.expectedVersion).toBe(1);
    const reviewed = {
      ...material,
      units: [{
        ...material.units[0],
        reviewCount: 1,
        lastScore: 91,
        nextReviewAt: "2026-10-13T08:00:00.000Z",
        weakPoints: [],
      }],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          material: reviewed,
          storageVersion: 2,
          evaluation: {
            score: 91,
            localScore: 100,
            source: "model",
            feedback: "关键关系准确。",
            missedPoints: [],
            model: "test-model",
          },
          taskDraft: {
            title: "复习：认识论",
            kind: "reminder",
            prompt: "打开背书训练复习。",
            schedule: { type: "once", runAt: "2026-10-13T08:00:00.000Z" },
          },
          taskDraftUnavailable: false,
        },
      }),
    });
  });
  await page.route("**/api/v1/tasks", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      title: "复习：认识论",
      kind: "reminder",
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "task-1" } }),
    });
  });

  await page.goto("/study/memorization");
  await expect(page.getByRole("heading", { name: "背书训练" })).toBeVisible();
  await page.getByLabel("材料标题").fill("认识论");
  await page.getByLabel("原始材料").fill("实践是检验真理的唯一标准。");
  await page.getByRole("button", { name: "生成可校对单元" }).click();
  await page.getByLabel("单元 1 提示").fill("真理标准");
  await page.getByRole("button", { name: "确认单元并开始复习" }).click();
  await page.getByLabel("请凭记忆复述").fill("实践是检验真理的唯一标准。");
  await page.getByRole("button", { name: "提交复述并评分" }).click();
  await expect(page.getByText("91", { exact: true })).toBeVisible();
  await expect(page.getByText("关键关系准确。")).toBeVisible();
  await page.getByRole("button", { name: "确认创建复习提醒" }).click();
  await expect(page.getByRole("status")).toContainText("核心任务系统创建");
});
