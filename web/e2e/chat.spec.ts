import { expect, test } from "@playwright/test";

test("chat session lifecycle survives reloads", async ({ page }) => {
  await page.goto("/chat");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "AI 对话" })).toBeVisible();
  await expect(page.getByText("暂无对话，点击上方按钮开始")).toBeVisible();
  await expect(page.getByText("点击左侧「新建对话」开始")).toBeVisible();

  await page.getByRole("button", { name: "+ 新建对话" }).click();
  await expect(page.getByPlaceholder("请输入你的问题")).toBeVisible();
  await expect(page.getByText("输入问题，AI 将为你提供帮助")).toBeVisible();

  await page.reload();
  await expect(page.getByText("新对话", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("请输入你的问题")).toBeVisible();

  await page.getByPlaceholder("请输入你的问题").fill("不会发送到模型");
  await page.getByPlaceholder("请输入你的问题").press("Enter");
  await expect(
    page.getByText("请先配置 API Key、Base URL 和 Model 才能使用 Chat 功能"),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(
    page.getByText("请先配置 API Key、Base URL 和 Model 才能使用 Chat 功能"),
  ).toBeHidden();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("删除对话").click({ force: true });
  await expect(page.getByText("暂无对话，点击上方按钮开始")).toBeVisible();

  await page.reload();
  await expect(page.getByText("暂无对话，点击上方按钮开始")).toBeVisible();
  await expect(page.getByPlaceholder("请输入你的问题")).toHaveCount(0);
});

test("regenerating an earlier answer creates and restores branches", async ({
  page,
}) => {
  const replies = ["第一版回答", "第二轮回答", "第一版回答的新分支"];
  await page.route("https://provider.example/**", async (route) => {
    const reply = replies.shift();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: reply ?? "意外请求" } }],
      }),
    });
  });

  await page.goto("/chat");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("agent_api_key", "e2e-key");
    window.localStorage.setItem(
      "agent_api_base_url",
      "https://provider.example/v1",
    );
    window.localStorage.setItem("agent_api_model", "e2e-model");
  });
  await page.reload();

  await page.getByRole("button", { name: "+ 新建对话" }).click();
  const composer = page.getByPlaceholder("请输入你的问题");
  await composer.fill("第一问");
  await composer.press("Enter");
  await expect(page.getByText("第一版回答", { exact: true })).toBeVisible();

  await composer.fill("第二问");
  await composer.press("Enter");
  await expect(page.getByText("第二轮回答", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "重新生成" }).first().click();
  await expect(
    page.getByText("第一版回答的新分支", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();
  await expect(page.getByText("第二问", { exact: true })).toHaveCount(0);
  await expect(page.getByText("第二轮回答", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "上一个回答版本" }).click();
  await expect(page.getByText("第一版回答", { exact: true })).toBeVisible();
  await expect(page.getByText("第二问", { exact: true })).toBeVisible();
  await expect(page.getByText("第二轮回答", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "下一个回答版本" }).first().click();
  await expect(
    page.getByText("第一版回答的新分支", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("第二问", { exact: true })).toHaveCount(0);
});

test("renders dollar and slash-delimited math in the chat page", async ({
  page,
}) => {
  await page.goto("/chat");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "agent_chat_sessions",
      JSON.stringify([
        {
          id: "math-session",
          title: "公式测试",
          schemaVersion: 2,
          activeLeafId: "math-answer",
          updatedAt: Date.now(),
          messages: [
            {
              id: "math-question",
              parentId: null,
              role: "user",
              content: "展示公式",
            },
            {
              id: "math-answer",
              parentId: "math-question",
              role: "assistant",
              content:
                "行内：\\(x^2\\) 与 $\\frac{a+b}{c+d}$\n\n\\[\\frac{1}{1 + \\frac{1}{x}}\\]\n\n以及 $z^2$",
            },
          ],
        },
      ]),
    );
  });
  await page.reload();

  await expect(page.locator(".katex")).toHaveCount(4);
  await expect(page.locator(".katex-display")).toHaveCount(1);
  await expect(page.locator(".mfrac")).toHaveCount(3);
  await expect(page.getByText("公式测试", { exact: true })).toBeVisible();
});
