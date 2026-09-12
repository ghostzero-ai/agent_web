import { expect, test } from "@playwright/test";

test("updates quiet hours on the mobile notification settings page", async ({ page }) => {
  let preferences = {
    pushEnabled: false,
    quietHoursEnabled: true,
    quietStart: "22:00",
    quietEnd: "08:00",
    timezone: "Asia/Shanghai",
    version: 1,
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/push/**", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      const input = request.postDataJSON();
      preferences = {
        pushEnabled: input.pushEnabled,
        quietHoursEnabled: input.quietHoursEnabled,
        quietStart: input.quietStart,
        quietEnd: input.quietEnd,
        timezone: "Asia/Shanghai",
        version: preferences.version + 1,
      };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: preferences }),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          publicKey: "AQIDBA",
          preferences,
          subscriptions: [],
        },
      }),
    });
  });

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "系统通知" })).toBeVisible();
  await expect(page.getByText("还没有设备订阅")).toBeVisible();
  await expect(page.getByText(/HarmonyOS 5：当前网页仍使用 Web Push/)).toBeVisible();
  await page.getByLabel("安静时段开始", { exact: true }).fill("23:15");
  await page.getByLabel("安静时段结束", { exact: true }).fill("07:30");
  await page.getByLabel("允许发送 Push").check();
  await page.getByRole("button", { name: "保存通知偏好" }).click();
  await expect(page.getByRole("status")).toContainText("通知偏好已保存");
  await expect(page.getByLabel("安静时段开始", { exact: true })).toHaveValue("23:15");
  await expect(page.getByLabel("安静时段结束", { exact: true })).toHaveValue("07:30");
});
