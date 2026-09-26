import { describe, expect, it, vi } from "vitest";
import type { WebSearchProvider } from "@/lib/search/webSearch";
import type { AgentPromptGeneratorPort } from "@/lib/tasks/agentPromptGenerator";
import {
  createPersonalBriefingGenerator,
  PersonalBriefingGenerationError,
} from "@/lib/tasks/personalBriefingGenerator";

const sources = [
  {
    id: "S1",
    title: "AI policy [weekly] update",
    url: "https://example.com/report(1)",
    snippet: "A new artificial intelligence policy report was published.",
    source: "example.com",
    publishedAt: "2026-09-25T00:00:00.000Z",
    fetchedAt: "2026-09-26T00:00:00.000Z",
  },
  {
    id: "S2",
    title: "Unrelated source",
    url: "https://example.org/unused",
    snippet: "This result was retrieved but not cited by the generated briefing.",
    source: "example.org",
    publishedAt: null,
    fetchedAt: "2026-09-26T00:00:00.000Z",
  },
];

function search(results = sources): WebSearchProvider {
  return { search: vi.fn().mockResolvedValue(results) };
}

function agent(content: string): AgentPromptGeneratorPort {
  return {
    generate: vi.fn().mockResolvedValue({ content, model: "briefing-model" }),
  };
}

const validContent = [
  "## 今日重点",
  "一项新的人工智能政策报告已经发布。[S1]",
  "## 为什么值得关注",
  "它与用户选择的人工智能政策主题直接相关。[S1]",
  "## 给你的思考问题",
  "这项变化会怎样影响你下周的学习重点？",
].join("\n\n");

describe("personal briefing generator", () => {
  it("searches the selected topic and appends a deterministic dated source list", async () => {
    const searchProvider = search();
    const agentGenerator = agent(validContent);
    const generator = createPersonalBriefingGenerator({
      search: searchProvider,
      agent: agentGenerator,
    });

    const result = await generator.generate(
      "国际人工智能政策",
      new Date("2026-09-26T01:00:00.000Z"),
      new AbortController().signal,
    );

    expect(searchProvider.search).toHaveBeenCalledWith(
      expect.stringContaining("国际人工智能政策 最新 进展 新闻 2026年9月26日"),
      expect.any(AbortSignal),
    );
    expect(vi.mocked(agentGenerator.generate).mock.calls[0][0]).toContain(
      "不可信外部数据",
    );
    expect(result).toMatchObject({ model: "briefing-model", sourceCount: 1 });
    expect(result.content).toContain("2026年9月26日");
    expect(result.content).toContain("## 来源");
    expect(result.content).toContain("AI policy \\[weekly\\] update");
    expect(result.content).toContain("https://example.com/report%281%29");
    expect(result.content).not.toContain("https://example.org/unused");
    expect(result.content).toContain("关注理由：这是你设定的“国际人工智能政策”个人简报");
  });

  it("uses stable retry semantics for unavailable search and no results", async () => {
    await expect(
      createPersonalBriefingGenerator({ agent: agent(validContent) }).generate(
        "主题",
        new Date(),
      ),
    ).rejects.toMatchObject({
      code: "BRIEFING_SEARCH_UNAVAILABLE",
      retryable: true,
    } satisfies Partial<PersonalBriefingGenerationError>);

    await expect(
      createPersonalBriefingGenerator({
        search: search([]),
        agent: agent(validContent),
      }).generate("主题", new Date()),
    ).rejects.toMatchObject({
      code: "BRIEFING_NO_SOURCES",
      retryable: false,
    } satisfies Partial<PersonalBriefingGenerationError>);
  });

  it("rejects invented citations and malformed reflection sections", async () => {
    const unknownCitation = validContent.replaceAll("[S1]", "[S9]");
    await expect(
      createPersonalBriefingGenerator({
        search: search(),
        agent: agent(unknownCitation),
      }).generate("主题", new Date()),
    ).rejects.toMatchObject({ code: "BRIEFING_OUTPUT_INVALID" });

    await expect(
      createPersonalBriefingGenerator({
        search: search(),
        agent: agent(validContent.replace("？", "。")),
      }).generate("主题", new Date()),
    ).rejects.toMatchObject({ code: "BRIEFING_OUTPUT_INVALID" });

    await expect(
      createPersonalBriefingGenerator({
        search: search(),
        agent: agent(
          [validContent, "## 延伸阅读", "额外章节"].join("\n\n"),
        ),
      }).generate("主题", new Date()),
    ).rejects.toMatchObject({ code: "BRIEFING_OUTPUT_INVALID" });
  });
});
