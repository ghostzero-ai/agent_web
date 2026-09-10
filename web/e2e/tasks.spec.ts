import { expect, test } from "@playwright/test";

test("creates, edits, pauses and deletes a reminder on mobile", async ({
  page,
}) => {
  type MockTask = {
    id: string;
    title: string;
    prompt: string | null;
    kind: "reminder";
    scheduleType: "once" | "daily" | "weekly";
    scheduleValue: Record<string, string | number>;
    timezone: string;
    nextRunAt: string | null;
    status: "active" | "paused";
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  let tasks: MockTask[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/tasks**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split("/").at(-1);
    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });

    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const task: MockTask = {
        id: "task-1",
        title: input.title,
        prompt: input.prompt,
        kind: "reminder",
        scheduleType: input.schedule.type,
        scheduleValue:
          input.schedule.type === "daily"
            ? { time: input.schedule.time }
            : input.schedule,
        timezone: "Asia/Shanghai",
        nextRunAt: "2030-01-01T12:00:00.000Z",
        status: "active",
        version: 1,
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      };
      tasks = [task];
      return respond(task, 201);
    }
    if (request.method() === "PATCH") {
      const input = request.postDataJSON();
      tasks = tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              title: input.title,
              prompt: input.prompt,
              status: input.status,
              nextRunAt:
                input.status === "paused"
                  ? null
                  : "2030-01-01T12:00:00.000Z",
              version: task.version + 1,
            }
          : task,
      );
      return respond(tasks.find((task) => task.id === id));
    }
    if (request.method() === "DELETE") {
      tasks = tasks.filter((task) => task.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    return respond(tasks);
  });

  await page.goto("/tasks");
  await expect(page.getByText("还没有提醒")).toBeVisible();

  await page.getByLabel("标题").fill("复习英语");
  await page.getByLabel("提醒内容（可选）").fill("背诵 20 个单词");
  await page.getByRole("button", { name: "创建提醒" }).click();
  await expect(page.getByRole("heading", { name: "复习英语" })).toBeVisible();
  await expect(page.getByText("每天 20:00")).toBeVisible();

  await page.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("标题").fill("复习英语单词");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(
    page.getByRole("heading", { name: "复习英语单词" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByText("已暂停", { exact: true }).first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("还没有提醒")).toBeVisible();
});
