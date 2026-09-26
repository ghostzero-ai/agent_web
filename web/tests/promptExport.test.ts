import { describe, expect, it } from "vitest";
import {
  createPromptExportArtifact,
  createPromptExportDocument,
  type PromptRequestSnapshot,
} from "@/lib/ai/promptExport";

const snapshot: PromptRequestSnapshot = {
  snapshotId: "snapshot-1",
  capturedAt: "2026-09-26T01:02:03.000Z",
  trigger: "send",
  conversation: {
    id: "conversation-1",
    title: "分数与极限 / 测试",
    activeLeafId: "message-1",
  },
  prompt: [
    {
      kind: "instruction",
      source: "persona",
      role: "system",
      content: "保持专业",
    },
    {
      kind: "context",
      source: "memory",
      role: "system",
      content: "用户偏好：先看例子",
    },
    {
      kind: "conversation",
      source: "conversation",
      role: "user",
      content: "解释 ``` 极限",
    },
  ],
  modelRequest: {
    requestId: "request-1",
    provider: "openai-compatible",
    baseUrl: "https://provider.example/v1",
    model: "study-model",
  },
};

describe("Prompt export", () => {
  it("redacts memory by default while keeping request metadata and a hash", async () => {
    const document = await createPromptExportDocument(snapshot, {
      includeMemory: false,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });

    expect(document.provider).toEqual(snapshot.modelRequest);
    expect(document.request.messages[1].content).toContain("已从导出文件中移除");
    expect(JSON.stringify(document)).not.toContain("先看例子");
    expect(document.privacy).toMatchObject({
      exactRequestContent: false,
      memoryIncluded: false,
      redactedSources: ["memory"],
    });
    expect(document.integrity.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(document)).not.toContain("apiKey");
  });

  it("includes the exact memory layer only after explicit confirmation", async () => {
    const document = await createPromptExportDocument(snapshot, {
      includeMemory: true,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });

    expect(document.request.messages[1].content).toContain("先看例子");
    expect(document.privacy.exactRequestContent).toBe(true);
    expect(document.privacy.memoryIncluded).toBe(true);
  });

  it("creates readable JSON and Markdown files with safe filenames", async () => {
    const json = await createPromptExportArtifact(snapshot, "json", {
      includeMemory: false,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });
    const markdown = await createPromptExportArtifact(snapshot, "markdown", {
      includeMemory: false,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });

    expect(json.filename).toBe("prompt-分数与极限-测试-20260926T020304000Z.json");
    expect(() => JSON.parse(json.content)).not.toThrow();
    expect(markdown.filename.endsWith(".md")).toBe(true);
    expect(markdown.content).toContain("# Prompt 导出");
    expect(markdown.content).toContain("````\n解释 ``` 极限\n````");
  });
});
