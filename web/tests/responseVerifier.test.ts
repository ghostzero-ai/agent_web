import { describe, expect, it } from "vitest";
import {
  isResponseVerification,
  verifyResponse,
} from "@/lib/ai/responseVerifier";
import type { SearchRetrieval, WebCitation } from "@/lib/search/webSearch";

const source: WebCitation = {
  id: "S1",
  title: "人工智能产业最新报告",
  url: "https://example.com/ai-report",
  snippet: "人工智能产业在 2026 年继续增长，研究机构发布了最新数据。",
  source: "example.com",
  publishedAt: "2026-09-25T00:00:00.000Z",
  fetchedAt: "2026-09-26T00:00:00.000Z",
};

function retrieval(
  overrides: Partial<SearchRetrieval> = {},
): SearchRetrieval {
  return {
    status: "completed",
    reason: "completed",
    query: "今天人工智能产业有什么最新消息？",
    citations: [source],
    ...overrides,
  };
}

describe("response verifier", () => {
  it("passes a dated current answer with a supported known citation", () => {
    const result = verifyResponse({
      answer:
        "截至 2026年9月，人工智能产业继续增长，研究机构发布了最新数据。[S1]",
      query: "今天人工智能产业有什么最新消息？",
      retrieval: retrieval(),
      checkedAt: "2026-09-26T01:00:00.000Z",
    });

    expect(result.status).toBe("pass");
    expect(result.checks.map((check) => check.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "pass",
    ]);
    expect(isResponseVerification(result)).toBe(true);
  });

  it("fails an invented citation id", () => {
    const result = verifyResponse({
      answer: "这是没有对应来源的事实。[S9]",
      query: "普通问题",
      retrieval: retrieval(),
    });

    expect(result.status).toBe("fail");
    expect(result.checks[0]).toMatchObject({
      id: "citation-integrity",
      status: "fail",
      citationIds: ["S9"],
    });
  });

  it("warns when retrieved evidence is not cited or lacks an explicit date", () => {
    const result = verifyResponse({
      answer: "人工智能产业有新的变化。",
      query: "今天人工智能产业有什么最新消息？",
      retrieval: retrieval(),
    });

    expect(result.status).toBe("warning");
    expect(result.checks[0].status).toBe("warning");
    expect(result.checks[2].status).toBe("warning");
  });

  it("makes failed retrieval and unqualified inference visible", () => {
    const result = verifyResponse({
      answer: "因此这一定会成为最终结果。",
      query: "今天有什么最新进展？",
      retrieval: retrieval({
        status: "failed",
        reason: "provider-unavailable",
        citations: [],
      }),
    });

    expect(result.status).toBe("warning");
    expect(result.checks[0]).toMatchObject({
      id: "citation-integrity",
      status: "warning",
    });
    expect(result.checks[2]).toMatchObject({
      id: "freshness",
      status: "warning",
    });
    expect(result.checks[3]).toMatchObject({
      id: "inference-boundary",
      status: "warning",
    });
  });

  it("rejects malformed persisted verification objects", () => {
    expect(
      isResponseVerification({
        schemaVersion: 1,
        verifierVersion: "forged",
        status: "pass",
        checks: [],
        limitations: [],
      }),
    ).toBe(false);
  });

  it("does not mark an empty provider answer as passed", () => {
    const result = verifyResponse({
      answer: "",
      query: "普通问题",
      retrieval: retrieval({
        status: "skipped",
        reason: "not-needed",
        citations: [],
      }),
    });
    expect(result.status).toBe("warning");
    expect(result.checks[3].status).toBe("warning");
  });
});
