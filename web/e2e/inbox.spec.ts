import { expect, test } from "@playwright/test";

test("renders and manages Agent task results on mobile", async ({ page }) => {
  type MockInboxItem = {
    id: string;
    taskId: string;
    taskRunId: string;
    source: "reminder" | "agent_prompt";
    title: string;
    body: string;
    occurredAt: string;
    status: "unread" | "read";
    readAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  let items: MockInboxItem[] = [
    {
      id: "item-1",
      taskId: "task-1",
      taskRunId: "run-1",
      source: "agent_prompt",
      title: "复习今日错题",
      body: "## AI 复习建议\n\n先回顾三道典型题",
      occurredAt: "2026-09-10T12:30:00.000Z",
      status: "unread",
      readAt: null,
      createdAt: "2026-09-10T12:30:00.000Z",
      updatedAt: "2026-09-10T12:30:00.000Z",
    },
  ];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/inbox**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split("/").at(-1);
    const respond = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });

    if (request.method() === "PATCH") {
      const input = request.postDataJSON() as { status: "unread" | "read" };
      items = items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: input.status,
              readAt: input.status === "read" ? new Date().toISOString() : null,
            }
          : item,
      );
      return respond(items.find((item) => item.id === id));
    }
    if (request.method() === "DELETE") {
      items = items.filter((item) => item.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }

    const filter = url.searchParams.get("filter");
    return respond(
      filter && filter !== "all"
        ? items.filter((item) => item.status === filter)
        : items,
    );
  });

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "复习今日错题" })).toBeVisible();
  await expect(page.getByText("AI 定时任务", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 复习建议" })).toBeVisible();
  await expect(page.getByText("先回顾三道典型题")).toBeVisible();

  await page.getByRole("button", { name: "标为已读" }).click();
  await expect(page.getByRole("button", { name: "标为未读" })).toBeVisible();

  await page.getByRole("button", { name: "未读", exact: true }).click();
  await expect(page.getByText("这里暂时没有提醒")).toBeVisible();

  await page.getByRole("button", { name: "已读", exact: true }).click();
  await expect(page.getByRole("heading", { name: "复习今日错题" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("这里暂时没有提醒")).toBeVisible();
});
