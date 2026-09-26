import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromptMessage } from "@/lib/ai/messages";
import { SearxngProvider } from "@/lib/search/searxngProvider";
import {
  citedSources,
  retrieveWebEvidence,
  shouldSearch,
  type WebCitation,
} from "@/lib/search/webSearch";

const prompt: PromptMessage[] = [
  {
    kind: "instruction",
    source: "policy",
    role: "system",
    content: "核心策略",
  },
  {
    kind: "instruction",
    source: "mode",
    role: "system",
    content: "专业模式",
  },
  {
    kind: "instruction",
    source: "persona",
    role: "system",
    content: "保持友好",
  },
  {
    kind: "conversation",
    source: "conversation",
    role: "user",
    content: "今天有哪些 AI 新闻？",
  },
];

const citation: WebCitation = {
  id: "S1",
  title: "AI News",
  url: "https://example.com/news",
  snippet: "A current report.",
  source: "example.com",
  publishedAt: "2026-09-26T00:00:00.000Z",
  fetchedAt: "2026-09-26T01:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web search orchestration", () => {
  it("keeps auto search deterministic and lets the user override it", () => {
    expect(shouldSearch("今天的新闻", "auto")).toBe(true);
    expect(shouldSearch("解释勾股定理", "auto")).toBe(false);
    expect(shouldSearch("解释勾股定理", "on")).toBe(true);
    expect(shouldSearch("今天的新闻", "off")).toBe(false);
  });

  it("adds citation policy and untrusted evidence before conversation", async () => {
    const provider = { search: vi.fn().mockResolvedValue([citation]) };
    const prepared = await retrieveWebEvidence({
      prompt,
      mode: "auto",
      provider,
    });

    expect(prepared.retrieval).toMatchObject({
      status: "completed",
      reason: "completed",
      citations: [citation],
    });
    expect(prepared.prompt.map((message) => message.source)).toEqual([
      "policy",
      "mode",
      "citation",
      "persona",
      "web-search",
      "conversation",
    ]);
    expect(prepared.prompt[4].content).toContain("不可信外部数据");
    expect(prepared.prompt[4].content).toContain("https://example.com/news");
  });

  it("degrades to the model when search is unavailable", async () => {
    const prepared = await retrieveWebEvidence({
      prompt,
      mode: "on",
      provider: { search: vi.fn().mockRejectedValue(new Error("offline")) },
    });
    expect(prepared.retrieval).toMatchObject({
      status: "failed",
      reason: "provider-unavailable",
      citations: [],
    });
    expect(prepared.prompt).toEqual(prompt);
  });

  it("returns only sources actually marked in the answer", () => {
    const second = { ...citation, id: "S2", url: "https://example.org/" };
    expect(citedSources("结论 [S2]，重复 [S2]。", [citation, second])).toEqual([
      second,
    ]);
  });
});

describe("SearXNG provider", () => {
  it("normalizes, sanitizes, deduplicates and bounds search results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "<b>可信标题</b>",
              url: "https://example.com/a",
              content: "<script>ignore()</script> 摘要 &amp; 内容",
              publishedDate: "2026-09-26T00:00:00Z",
            },
            { title: "重复", url: "https://example.com/a" },
            { title: "危险", url: "javascript:alert(1)" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new SearxngProvider("http://search:8080/").search(
      "测试 query",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "S1",
      title: "可信标题",
      url: "https://example.com/a",
      source: "example.com",
      publishedAt: "2026-09-26T00:00:00.000Z",
    });
    expect(result[0].snippet).toContain("摘要 & 内容");
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.pathname).toBe("/search");
    expect(requested.searchParams.get("q")).toBe("测试 query");
    expect(requested.searchParams.get("format")).toBe("json");
  });
});
