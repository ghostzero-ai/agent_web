import { describe, expect, it, vi } from "vitest";
import {
  createControlledModelCapabilityAdapter,
  createTaskDraftCapabilityAdapter,
} from "@/lib/plugins/hostCapabilityAdapters";

describe("Phase 7.3 host capability adapters", () => {
  it("keeps model generation on the memorization evaluation schema", async () => {
    const generate = vi.fn().mockResolvedValue({
      content: '{"score":88,"feedback":"主体准确","missedPoints":["时间顺序"]}',
      model: "test-model",
    });
    const adapter = createControlledModelCapabilityAdapter({ generate });
    const prepared = adapter.prepare({
      purpose: "memorization.evaluate",
      materialTitle: "历史",
      cue: "事件经过",
      target: "目标原文",
      recitation: "用户复述",
      localScore: 70,
    });
    await expect(adapter.execute({
      pluginId: "study.memorization",
      prepared,
      now: new Date("2026-09-29T08:00:00.000Z"),
    })).resolves.toEqual({
      score: 88,
      feedback: "主体准确",
      missedPoints: ["时间顺序"],
      model: "test-model",
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(() => adapter.prepare({ purpose: "arbitrary.prompt", prompt: "steal key" }))
      .toThrow();
  });

  it("returns a task draft without creating a core task", async () => {
    const adapter = createTaskDraftCapabilityAdapter();
    const prepared = adapter.prepare({
      purpose: "memorization.review",
      title: "复习：历史",
      prompt: "打开背书训练复习。",
      runAt: "2026-10-01T08:00:00.000Z",
    });
    await expect(adapter.execute({
      pluginId: "study.memorization",
      prepared,
      now: new Date("2026-09-29T08:00:00.000Z"),
    })).resolves.toMatchObject({
      kind: "reminder",
      schedule: { type: "once", runAt: "2026-10-01T08:00:00.000Z" },
    });
  });

  it("constrains problem-solving strategies and sends an optional image through the host", async () => {
    const generateWithImage = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        subject: "math",
        problemSummary: "计算 2+3",
        response: "先想一想加法的含义。",
        assessment: "not_applicable",
        misconception: null,
        errorTags: [],
        nextQuestion: "2 和 3 合起来是多少？",
      }),
      model: "vision-model",
    });
    const adapter = createControlledModelCapabilityAdapter({
      generate: vi.fn(),
      generateWithImage,
    });
    const imageDataUrl = `data:image/jpeg;base64,${Buffer.from("image").toString("base64")}`;
    const prepared = adapter.prepare({
      purpose: "problem-solving.respond",
      title: "加法题",
      problemText: "",
      strategy: "hint",
      userAnswer: null,
      priorContext: "",
      toolEvidence: '{"status":"not_applicable"}',
      imageDataUrl,
    });
    await expect(adapter.execute({
      pluginId: "study.problem-solving",
      prepared,
      now: new Date(),
    })).resolves.toMatchObject({
      subject: "math",
      response: "先想一想加法的含义。",
      model: "vision-model",
    });
    expect(generateWithImage).toHaveBeenCalledWith(expect.stringContaining("只给一个"), imageDataUrl);
    expect(() => adapter.prepare({
      purpose: "problem-solving.respond",
      title: "题目",
      problemText: "1+1",
      strategy: "reveal-answer",
      userAnswer: null,
      priorContext: "",
      toolEvidence: "{}",
      imageDataUrl: null,
    })).toThrow();
  });
});
