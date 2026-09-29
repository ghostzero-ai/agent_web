import { expect, test } from "@playwright/test";

test("completes the problem-solving strategy, mistake and review-card loop on mobile", async ({ page }) => {
  const caseId = "11111111-1111-4111-8111-111111111111";
  const attemptId = "22222222-2222-4222-8222-222222222222";
  const cardId = "33333333-3333-4333-8333-333333333333";
  const baseCase = {
    schemaVersion: 1,
    id: caseId,
    title: "加法错题",
    problemText: "计算 2+3",
    normalizedProblem: null,
    image: null,
    subject: null,
    attempts: [],
    reviewCards: [],
    createdAt: "2026-09-29T08:00:00.000Z",
    updatedAt: "2026-09-29T08:00:00.000Z",
  };
  let created = false;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/problem-solving", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toMatchObject({
        title: "加法错题",
        problemText: "计算 2+3",
      });
      created = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { problemCase: baseCase, storageVersion: 1 } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: created ? [{
          id: caseId,
          title: "加法错题",
          subject: "math",
          attemptCount: 1,
          reviewCardCount: 1,
          latestAssessment: "incorrect",
          latestErrorTags: ["计算错误"],
          updatedAt: baseCase.updatedAt,
        }] : [],
      }),
    });
  });
  const attempt = {
    id: attemptId,
    strategy: "check",
    userAnswer: "4",
    response: "你的答案与计算结果不一致，请重新计算。",
    assessment: "incorrect",
    misconception: "基础加法计算错误",
    errorTags: ["计算错误"],
    nextQuestion: "2 和 3 合起来是多少？",
    toolVerification: {
      status: "mismatch",
      expression: "2+3",
      expected: 5,
      submitted: 4,
      note: "用户数值答案与基础算术解析器结果不一致。",
    },
    model: "test-model",
    createdAt: baseCase.updatedAt,
  };
  const solvedCase = {
    ...baseCase,
    normalizedProblem: "计算 2+3",
    subject: "math",
    attempts: [attempt],
  };
  await page.route(`**/api/v1/problem-solving/${caseId}/interactions`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      strategy: "check",
      userAnswer: "4",
      expectedVersion: 1,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { problemCase: solvedCase, storageVersion: 2, attempt } }),
    });
  });
  const card = {
    id: cardId,
    sourceAttemptId: attemptId,
    front: "基础加法计算前应检查什么？",
    back: "先确认数字和运算符，再逐步计算。",
    reason: "本题出现了基础计算错误。",
    tags: ["加法"],
    createdAt: baseCase.updatedAt,
  };
  await page.route(`**/api/v1/problem-solving/${caseId}/review-cards`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ attemptId, expectedVersion: 2 });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          problemCase: { ...solvedCase, reviewCards: [card] },
          storageVersion: 3,
          card,
        },
      }),
    });
  });
  await page.route(`**/api/v1/problem-solving/${caseId}/task-draft`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ cardId, expectedVersion: 3 });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          title: "错题复习：加法错题",
          kind: "reminder",
          prompt: "打开解题训练复习。",
          schedule: { type: "once", runAt: "2026-10-02T08:00:00.000Z" },
        },
      }),
    });
  });
  await page.route("**/api/v1/tasks", (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ data: { id: "task-1" } }),
  }));

  await page.goto("/study/problem-solving");
  await expect(page.getByRole("heading", { name: "解题训练" })).toBeVisible();
  await page.getByLabel("题目标题").fill("加法错题");
  await page.getByLabel("题目文字（有图片时可不填）").fill("计算 2+3");
  await page.getByRole("button", { name: "保存并选择解题方式" }).click();
  await page.getByRole("button", { name: "检查答案" }).click();
  await page.getByLabel("你的答案或当前思路（必填）").fill("4");
  await page.getByRole("button", { name: "检查答案" }).last().click();
  await expect(page.getByText("工具发现不一致")).toBeVisible();
  await expect(page.getByText("基础加法计算错误", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "把本轮错因生成复习卡" }).click();
  await expect(page.getByText("基础加法计算前应检查什么？")).toBeVisible();
  await page.getByRole("button", { name: "生成三天后复习任务草稿" }).click();
  await page.getByRole("button", { name: "确认创建核心任务" }).click();
  await expect(page.getByRole("status")).toContainText("核心任务系统");
});
