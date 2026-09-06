import { expect, test, type Page } from "@playwright/test";

type MockMessage = {
  id: string;
  parentMessageId: string | null;
  role: "user" | "assistant";
  content: string;
  status: "complete";
  model: null;
  citations: never[];
  createdAt: string;
};

type MockConversation = {
  id: string;
  userId: string;
  title: string;
  mode: "auto";
  summary: null;
  activeLeafMessageId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  messages: MockMessage[];
};

async function installServerDataMock(page: Page) {
  const conversations = new Map<string, MockConversation>();
  const importedSourceIds = new Set<string>();
  const respond = (route: Parameters<Parameters<Page["route"]>[1]>[0], data: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ data }) });

  await page.route("**/api/v1/imports/local-storage", async (route) => {
    const body = route.request().postDataJSON() as {
      action: "preview" | "import";
      sessions: Array<{
        id: string;
        title: string;
        activeLeafId: string | null;
        updatedAt: number;
        messages: Array<{
          id: string;
          parentId: string | null;
          role: "user" | "assistant";
          content: string;
          createdAt: number;
        }>;
      }>;
    };
    const pending = body.sessions.filter((session) => !importedSourceIds.has(session.id));
    if (body.action === "preview") {
      return respond(route, {
        total: body.sessions.length,
        importable: pending.length,
        alreadyImported: body.sessions.length - pending.length,
        existingSourceIds: body.sessions
          .filter((session) => importedSourceIds.has(session.id))
          .map((session) => session.id),
      });
    }

    const conversationIds: string[] = [];
    for (const session of pending) {
      const id = crypto.randomUUID();
      const idMap = new Map(session.messages.map((message) => [message.id, crypto.randomUUID()]));
      const timestamp = new Date(session.updatedAt).toISOString();
      conversations.set(id, {
        id,
        userId: "00000000-0000-4000-8000-000000000001",
        title: session.title,
        mode: "auto",
        summary: null,
        activeLeafMessageId: session.activeLeafId ? idMap.get(session.activeLeafId)! : null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: session.messages.map((message) => ({
          id: idMap.get(message.id)!,
          parentMessageId: message.parentId ? idMap.get(message.parentId)! : null,
          role: message.role,
          content: message.content,
          status: "complete",
          model: null,
          citations: [],
          createdAt: new Date(message.createdAt).toISOString(),
        })),
      });
      importedSourceIds.add(session.id);
      conversationIds.push(id);
    }
    return respond(route, {
      total: body.sessions.length,
      importable: pending.length,
      alreadyImported: body.sessions.length - pending.length,
      existingSourceIds: [],
      imported: pending.length,
      conversationIds,
    }, 201);
  });

  await page.route("**/api/v1/conversations**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const conversationIndex = parts.indexOf("conversations");
    const id = parts[conversationIndex + 1];
    const child = parts[conversationIndex + 2];

    if (!id && request.method() === "GET") {
      return respond(
        route,
        Array.from(conversations.values()).map((conversation) => ({
          id: conversation.id,
          userId: conversation.userId,
          title: conversation.title,
          mode: conversation.mode,
          summary: conversation.summary,
          activeLeafMessageId: conversation.activeLeafMessageId,
          version: conversation.version,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        })),
      );
    }
    if (!id && request.method() === "POST") {
      const now = new Date().toISOString();
      const created: MockConversation = {
        id: crypto.randomUUID(),
        userId: "00000000-0000-4000-8000-000000000001",
        title: "新对话",
        mode: "auto",
        summary: null,
        activeLeafMessageId: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      conversations.set(created.id, created);
      return respond(route, created, 201);
    }

    const conversation = conversations.get(id);
    if (!conversation) return route.fulfill({ status: 404, body: "{}" });
    if (!child && request.method() === "GET") return respond(route, conversation);
    if (!child && request.method() === "DELETE") {
      conversations.delete(id);
      return route.fulfill({ status: 204, body: "" });
    }
    if (!child && request.method() === "PATCH") {
      const body = request.postDataJSON() as { title: string };
      conversation.title = body.title;
      conversation.version += 1;
      conversation.updatedAt = new Date().toISOString();
      return respond(route, conversation);
    }
    if (child === "messages" && request.method() === "POST") {
      const body = request.postDataJSON() as Pick<
        MockMessage,
        "parentMessageId" | "role" | "content"
      >;
      const message: MockMessage = {
        ...body,
        id: crypto.randomUUID(),
        status: "complete",
        model: null,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      conversation.messages.push(message);
      conversation.activeLeafMessageId = message.id;
      conversation.version += 1;
      conversation.updatedAt = new Date().toISOString();
      return respond(route, { conversation, message }, 201);
    }
    if (child === "active-leaf" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { messageId: string | null };
      conversation.activeLeafMessageId = body.messageId;
      conversation.version += 1;
      conversation.updatedAt = new Date().toISOString();
      return respond(route, conversation);
    }
    return route.fulfill({ status: 405, body: "{}" });
  });
}

test("chat session lifecycle survives reloads", async ({ page }) => {
  await installServerDataMock(page);
  await page.goto("/chat");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("agent_api_key", "must-be-removed");
    window.localStorage.setItem("agent_api_base_url", "https://legacy.example");
    window.localStorage.setItem("agent_api_model", "legacy-model");
  });
  await page.reload();

  await expect
    .poll(() =>
      page.evaluate(() => ({
        key: window.localStorage.getItem("agent_api_key"),
        baseUrl: window.localStorage.getItem("agent_api_base_url"),
        model: window.localStorage.getItem("agent_api_model"),
      })),
    )
    .toEqual({ key: null, baseUrl: null, model: null });

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
    page.getByText("Server model provider is not configured."),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(
    page.getByText("Server model provider is not configured."),
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
  await installServerDataMock(page);
  const replies = ["第一版回答", "第二轮回答", "第一版回答的新分支"];
  await page.route("**/api/v1/model/stream", async (route) => {
    const reply = replies.shift();
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'event: meta\ndata: {"model":"e2e-model"}\n\n',
        `event: delta\ndata: ${JSON.stringify({ text: reply ?? "意外请求" })}\n\n`,
        "event: done\ndata: {}\n\n",
      ].join(""),
    });
  });

  await page.goto("/chat");
  await page.evaluate(() => {
    window.localStorage.clear();
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
  await installServerDataMock(page);
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

  await page.getByRole("button", { name: "确认导入" }).click();

  await expect(page.locator(".katex")).toHaveCount(4);
  await expect(page.locator(".katex-display")).toHaveCount(1);
  await expect(page.locator(".mfrac")).toHaveCount(3);
  await expect(page.getByText("公式测试", { exact: true })).toBeVisible();
});
