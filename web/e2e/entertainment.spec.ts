import { expect, test } from "@playwright/test";

test("creates and edits an isolated GameSession on mobile", async ({ page }) => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const characterId = "22222222-2222-4222-8222-222222222222";
  let version = 1;
  let tone = "悬疑、克制";
  let status: "setup" | "active" | "paused" = "setup";
  let activeLeafTurnId: string | null = null;
  const turns: Array<Record<string, unknown>> = [];
  const detail = () => ({
    id: sessionId,
    userId: "00000000-0000-4000-8000-000000000001",
    title: "雾港来信",
    kind: "roleplay",
    status,
    worldName: "雾港",
    worldPremise: "一座只在雨夜出现的港口。",
    worldTone: tone,
    worldRules: ["线索不会凭空消失"],
    safetyBoundaries: ["不把虚构当作现实"],
    activeLeafTurnId,
    version,
    createdAt: "2026-09-30T03:00:00.000Z",
    updatedAt: "2026-09-30T03:00:00.000Z",
    characters: [{
      id: characterId,
      sessionId,
      name: "林舟",
      role: "调查员",
      controller: "user",
      description: "收到一封来自雾港的旧信。",
      personality: "谨慎但好奇",
      goals: ["查明寄信人"],
      boundaries: [],
      version: 1,
      createdAt: "2026-09-30T03:00:00.000Z",
      updatedAt: "2026-09-30T03:00:00.000Z",
    }],
    turns,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/game-sessions", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
      return;
    }
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({
      title: "雾港来信",
      kind: "roleplay",
      world: {
        name: "雾港",
        premise: "一座只在雨夜出现的港口。",
        rules: ["线索不会凭空消失"],
        boundaries: ["不把虚构当作现实"],
      },
      initialCharacter: {
        name: "林舟",
        role: "调查员",
        controller: "user",
      },
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: detail() }),
    });
  });
  await page.route(`**/api/v1/game-sessions/${sessionId}`, async (route) => {
    const input = route.request().postDataJSON();
    expect(input.expectedVersion).toBe(1);
    tone = input.world.tone;
    version = 2;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: detail() }),
    });
  });
  await page.route(`**/api/v1/game-sessions/${sessionId}/status`, async (route) => {
    const input = route.request().postDataJSON();
    expect(input.expectedVersion).toBe(version);
    status = input.status;
    version += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: detail() }),
    });
  });
  await page.route(`**/api/v1/game-sessions/${sessionId}/turns`, async (route) => {
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({
      content: "我把旧信放在吧台上。",
      parentTurnId: null,
      expectedVersion: version,
    });
    activeLeafTurnId = "33333333-3333-4333-8333-333333333333";
    turns.push({
      id: activeLeafTurnId,
      sessionId,
      parentTurnId: null,
      playerContent: input.content,
      assistantContent: "老板停下擦杯子的动作，目光落在旧信的火漆上。",
      model: "test-model",
      createdAt: "2026-09-30T05:00:00.000Z",
    });
    version += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: detail() }),
    });
  });
  await page.route(`**/api/v1/game-sessions/${sessionId}/export`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ format: "markdown" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        filename: "雾港来信-2026-09-30.md",
        mediaType: "text/markdown",
        content: "# 雾港来信\n\n老板停下擦杯子的动作。",
      } }),
    });
  });

  await page.goto("/entertainment");
  await expect(page.getByRole("heading", { name: "娱乐模式" })).toBeVisible();
  await expect(page.getByText("不会进入普通对话或长期记忆")).toBeVisible();

  await page.getByLabel("会话名称").fill("雾港来信");
  await page.getByLabel("世界名称").fill("雾港");
  await page.getByLabel("世界前提").fill("一座只在雨夜出现的港口。");
  await page.getByLabel("叙事语调").fill("悬疑、克制");
  await page.getByLabel("世界规则").fill("线索不会凭空消失");
  await page.getByLabel("内容边界").fill("不把虚构当作现实");
  await page.getByLabel("角色名称").fill("林舟");
  await page.getByLabel("身份/职责").fill("调查员");
  await page.getByLabel("角色简介").fill("收到一封来自雾港的旧信。");
  await page.getByLabel("性格与表达").fill("谨慎但好奇");
  await page.getByLabel("角色目标").fill("查明寄信人");
  await page.getByRole("button", { name: "创建独立游戏会话" }).click();

  await expect(page.getByRole("status")).toContainText("虚构内容不会进入普通记忆");
  await expect(page.getByLabel("角色名称").first()).toHaveValue("林舟");
  await page.getByLabel("叙事语调").fill("温暖但保留悬念");
  await page.getByRole("button", { name: "保存世界设定" }).click();
  await expect(page.getByRole("status")).toHaveText("世界设定已保存。");
  await expect(page.getByText("设定版本 2")).toBeVisible();

  await page.getByRole("button", { name: "开始故事" }).click();
  await expect(page.getByText("进行中 · 0 个回合节点")).toBeVisible();
  await page.getByLabel("你的行动或台词").fill("我把旧信放在吧台上。");
  await page.getByRole("button", { name: "发送并继续" }).click();
  await expect(page.getByText("老板停下擦杯子的动作，目光落在旧信的火漆上。")).toBeVisible();
  await expect(page.getByText("当前剧情线 · 当前叶子")).toBeVisible();
  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByText("已暂停 · 1 个回合节点")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("雾港来信-2026-09-30.md");
});
