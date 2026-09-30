import { expect, test } from "@playwright/test";
import { getGameRulePackRegistry } from "../lib/gameRulePacks/registry";
import { DEFAULT_QUICK_ADVENTURE_SETUP, QUICK_ADVENTURE_RULE_PACK_ID } from "../lib/gameRulePacks/quickAdventure";

test("previews a rule pack and explicitly creates the selected GameSession on mobile", async ({ page }) => {
  const sessionId = "66666666-6666-4666-8666-666666666666";
  let creations = 0;
  let storageVersion = 0;
  let setup = { ...DEFAULT_QUICK_ADVENTURE_SETUP };
  const timestamp = "2026-09-30T08:00:00.000Z";
  const detail = () => {
    const draft = getGameRulePackRegistry().buildDraft(QUICK_ADVENTURE_RULE_PACK_ID, setup);
    return {
      id: sessionId, userId: "00000000-0000-4000-8000-000000000001",
      title: draft.session.title, kind: "tabletop", status: "setup", version: 1,
      worldName: draft.session.world.name, worldPremise: draft.session.world.premise,
      worldTone: draft.session.world.tone, worldRules: draft.session.world.rules,
      safetyBoundaries: draft.session.world.boundaries, activeLeafTurnId: null,
      characters: [{ ...draft.session.initialCharacter, id: "77777777-7777-4777-8777-777777777777", sessionId, version: 1, createdAt: timestamp, updatedAt: timestamp }],
      turns: [], events: [], checkpoints: [], createdAt: timestamp, updatedAt: timestamp,
    };
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**/api/v1/game-rule-packs/${QUICK_ADVENTURE_RULE_PACK_ID}`, async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      expect(input.expectedVersion).toBe(storageVersion);
      setup = input.setup;
      storageVersion += 1;
      return route.fulfill({ json: { data: { draft: getGameRulePackRegistry().buildDraft(QUICK_ADVENTURE_RULE_PACK_ID, setup), storageVersion } } });
    }
    return route.fulfill({ json: { data: { setup: storageVersion ? setup : null, storageVersion } } });
  });
  await page.route("**/api/v1/game-sessions", async (route) => {
    if (route.request().method() === "POST") {
      creations += 1;
      expect(route.request().postDataJSON()).toMatchObject({
        kind: "tabletop", initialCharacter: { name: "星禾", attributes: { 灵巧: 3 }, maxHealth: 10 },
      });
      return route.fulfill({ status: 201, json: { data: detail() } });
    }
    // The requested session must win over the first/newest item in the list.
    return route.fulfill({ json: { data: [
      { ...detail(), id: "88888888-8888-4888-8888-888888888888", title: "别的会话" }, detail(),
    ] } });
  });
  await page.route(`**/api/v1/game-sessions/${sessionId}`, (route) => route.fulfill({ json: { data: detail() } }));
  await page.goto("/entertainment/quick-adventure");
  await page.getByLabel("世界模板").selectOption("star-ruins");
  await page.getByLabel("主角名称").fill("星禾");
  await page.getByLabel("擅长属性").selectOption("灵巧");
  await page.getByRole("button", { name: "保存配置并预览" }).click();
  await expect(page.getByRole("region", { name: "游戏设定预览" })).toContainText("星灯遗迹 · 星禾");
  expect(creations).toBe(0);
  await page.getByLabel("故事氛围").selectOption("warm");
  await expect(page.getByRole("button", { name: "确认创建游戏会话" })).toHaveCount(0);
  await page.getByRole("button", { name: "保存配置并预览" }).click();
  await page.getByRole("button", { name: "确认创建游戏会话" }).click();
  await expect(page.getByRole("status")).toContainText("游戏会话已创建");
  expect(creations).toBe(1);
  await expect(page.getByRole("button", { name: "确认创建游戏会话" })).toHaveCount(0);
  await page.getByRole("link", { name: "进入游戏", exact: true }).click();
  await expect(page).toHaveURL(`/entertainment?session=${sessionId}`);
  await expect(page.getByLabel("会话名称")).toHaveValue("星灯遗迹 · 星禾");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("offers plugin authorization and restores setup after an explicit reload", async ({ page }) => {
  let authorized = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**/api/v1/game-rule-packs/${QUICK_ADVENTURE_RULE_PACK_ID}`, (route) => authorized
    ? route.fulfill({ json: { data: { setup: { ...DEFAULT_QUICK_ADVENTURE_SETUP, heroName: "已保存的主角" }, storageVersion: 3 } } })
    : route.fulfill({ status: 403, json: { error: { code: "CAPABILITY_NOT_GRANTED", message: "Not granted." } } }));
  await page.goto("/entertainment/quick-adventure");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("授权它保存配置");
  await expect(page.getByRole("link", { name: "管理规则包插件" })).toHaveAttribute("href", "/plugins");
  await expect(page.getByRole("button", { name: "保存配置并预览" })).toBeDisabled();
  authorized = true;
  await page.getByRole("button", { name: "重新加载配置" }).click();
  await expect(page.getByLabel("主角名称")).toHaveValue("已保存的主角");
  await expect(page.getByRole("button", { name: "保存配置并预览" })).toBeEnabled();
});
