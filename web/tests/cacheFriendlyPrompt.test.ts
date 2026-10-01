import { describe, expect, it } from "vitest";
import { stableJson } from "@/lib/ai/stableJson";
import { addSearchEvidence } from "@/lib/search/webSearch";
import { createTestPromptEnvelope, TEST_PROMPT } from "./helpers/promptEnvelope";

describe("cache-friendly prompt contracts", () => {
  it("canonicalizes object keys without rewriting strings or array ordering", () => {
    expect(stableJson({ b: 2, a: { y: "保留  空格", x: [2, 1] } })).toBe(stableJson({ a: { x: [2, 1], y: "保留  空格" }, b: 2 }));
    expect(JSON.parse(stableJson({ text: "x\ny", list: ["b", "a"] }))).toEqual({ text: "x\ny", list: ["b", "a"] });
  });
  it("does not let audit ids, titles or timestamps enter the actual model request", async () => {
    const first = await createTestPromptEnvelope();
    const second = await createTestPromptEnvelope({ runId: crypto.randomUUID(), createdAt: "2026-10-01T00:00:00.000Z", title: "different title" });
    expect(first.request).toEqual(second.request);
    expect(first.integrity.contentHash).not.toEqual(second.integrity.contentHash);
  });
  it("does not send volatile retrieval timestamps, but retains evidence and its publication date", () => {
    const source = { id: "S1", title: "题目", url: "https://example.com", snippet: "证据", source: "example.com", publishedAt: "2026-10-01T00:00:00.000Z", fetchedAt: "2026-10-01T01:00:00.000Z" };
    const first = addSearchEvidence(TEST_PROMPT, [source]);
    const second = addSearchEvidence(TEST_PROMPT, [{ ...source, fetchedAt: "2026-10-01T02:00:00.000Z" }]);
    expect(first).toEqual(second);
    const evidence = first.find((message) => message.source === "web-search")!.content;
    expect(evidence).toContain(source.publishedAt);
    expect(evidence).not.toContain("fetchedAt");
    expect(evidence).toContain('"retrievedOn":"2026-10-01"');
    expect(evidence).toContain("证据");
  });
});
