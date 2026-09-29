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
});
