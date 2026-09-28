import { expect, test } from "@playwright/test";

test("configures, evaluates and narrows explainable proactivity on mobile", async ({
  page,
}) => {
  const userId = "00000000-0000-0000-0000-000000000001";
  let preferences = {
    userId,
    enabled: false,
    maxMessagesPerDay: 1,
    minCooldownHours: 72,
    checkinAfterDays: 3,
    allowedReasons: ["goal_followup", "checkin"],
    pausedUntil: null as string | null,
    version: 1,
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
  };
  let recentContacts: Array<{
    id: string;
    inboxItemId: string;
    reason: "goal_followup" | "checkin";
    rationale: string;
    createdAt: string;
    inboxStatus: "unread" | "read";
  }> = [];

  const dashboard = () => ({
    preferences,
    quietHours: {
      enabled: true,
      start: "23:00",
      end: "07:00",
      timezone: "Asia/Shanghai",
    },
    recentContacts,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/proactivity", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const input = route.request().postDataJSON();
      preferences = {
        ...preferences,
        ...input,
        version: preferences.version + 1,
        updatedAt: "2026-09-28T01:00:00.000Z",
      };
      delete (preferences as typeof preferences & { expectedVersion?: number })
        .expectedVersion;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: dashboard() }),
      });
      return;
    }
    if (method === "POST") {
      recentContacts = [
        {
          id: "20000000-0000-0000-0000-000000000001",
          inboxItemId: "30000000-0000-0000-0000-000000000001",
          reason: "checkin",
          rationale: "因为你主动开启了 3 天未互动后的温和问候。",
          createdAt: "2026-09-28T02:00:00.000Z",
          inboxStatus: "unread",
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            status: "created",
            reason: "checkin",
            inboxItemId: recentContacts[0].inboxItemId,
            rationale: recentContacts[0].rationale,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: dashboard() }),
    });
  });

  await page.goto("/proactivity");
  await expect(page.getByRole("heading", { name: "主动问候" })).toBeVisible();
  await page.getByLabel("允许主动问候").check();
  await page.getByLabel("每日最多主动问候").selectOption("2");
  await page.getByLabel("主动问候冷却时间").selectOption("48");
  await page.getByRole("button", { name: "保存主动问候设置" }).click();
  await expect(page.getByRole("status")).toContainText("设置已保存");
  expect(preferences).toMatchObject({
    enabled: true,
    maxMessagesPerDay: 2,
    minCooldownHours: 48,
    version: 2,
  });

  await page
    .getByRole("button", { name: "按已保存规则检查一次" })
    .click();
  await expect(page.getByRole("status")).toContainText("已按当前规则生成一条问候");
  await expect(page.getByText("因为你主动开启了 3 天未互动后的温和问候。"))
    .toBeVisible();

  await page.getByRole("button", { name: "不要再因此联系" }).click();
  await expect(page.getByRole("status")).toContainText("这一类触发原因已关闭");
  expect(preferences.allowedReasons).toEqual(["goal_followup"]);
});
