import { expect, test } from "@playwright/test";

test("reviews, edits and confirms a memory candidate on mobile", async ({ page }) => {
  let candidate = {
    id: "00000000-0000-4000-8000-000000000011",
    sourceConversationId: "00000000-0000-4000-8000-000000000012",
    sourceMessageId: "00000000-0000-4000-8000-000000000013",
    kind: "goal",
    content: "我的长期目标是完成作品集",
    evidenceQuote: "请记住：我的长期目标是完成作品集",
    sensitivity: "low",
    confidence: 95,
    reason: "用户明确要求记住；仍需确认。",
    status: "pending",
    resolvedAt: null as string | null,
    version: 1,
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T10:00:00.000Z",
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/memory-candidates**", async (route) => {
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      candidate = {
        ...candidate,
        content: input.content ?? candidate.content,
        status: input.action === "confirm" ? "confirmed" : "rejected",
        resolvedAt: "2026-09-27T10:01:00.000Z",
        version: candidate.version + 1,
        updatedAt: "2026-09-27T10:01:00.000Z",
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: route.request().method() === "GET" ? [candidate] : candidate }),
    });
  });

  await page.goto("/memory");
  await expect(page.getByRole("heading", { name: "记忆先确认，再生效" })).toBeVisible();
  await expect(page.getByText("原始证据：")).toBeVisible();
  const editor = page.getByLabel(/编辑候选/);
  await editor.fill("我的长期目标是完成并公开展示作品集");
  await page.getByRole("button", { name: "确认记住" }).click();

  await expect(page.getByText("已确认")).toBeVisible();
  await expect(page.getByText("我的长期目标是完成并公开展示作品集")).toBeVisible();
  await expect(page.getByText("等待你确认")).toBeVisible();
});
