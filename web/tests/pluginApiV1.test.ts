import { describe, expect, it } from "vitest";
import {
  FIRST_PARTY_PLUGIN_ACTIVITIES,
  hasValidActivityContributions,
  listPluginActivities,
  ownsRegisteredActivity,
} from "@/lib/plugins/activityRegistry";
import {
  learningCardContentSchema,
  learningCardDraftSchema,
  PLUGIN_API_V1_CONTRACT,
  pluginExecutionContextSchema,
  pluginModelGenerateRequestSchema,
  pluginStorageEntrySchema,
  pluginStorageRequestSchema,
  pluginTaskDraftRequestSchema,
} from "@/lib/plugins/pluginApiV1";

describe("Phase 7.5 Plugin API v1 contract", () => {
  it("publishes the frozen host contract and shared capability envelopes", () => {
    expect(PLUGIN_API_V1_CONTRACT).toEqual({
      version: "1.0.0",
      manifestSchemaVersion: "1",
      capabilities: ["model.generate", "storage.read-write", "task.create-draft"],
      modelDispatch: "registered-operation",
      taskWrites: "draft-only",
      crossPluginData: "host-contract-only",
      activityUi: "precompiled-host-registry",
    });
    expect(pluginModelGenerateRequestSchema.parse({
      operation: "memorization.evaluate",
      input: { cue: "test" },
    })).toMatchObject({ operation: "memorization.evaluate" });
    expect(pluginModelGenerateRequestSchema.safeParse({
      operation: "memorization.evaluate",
    }).success).toBe(false);
    expect(pluginStorageRequestSchema.parse({
      operation: "list",
      prefix: "materials/",
    })).toMatchObject({ limit: 50 });
    expect(pluginStorageEntrySchema.parse({
      key: "materials/1",
      value: { title: "test" },
      byteSize: 20,
      version: 1,
      updatedAt: "2026-09-30T00:00:00.000Z",
    }).updatedAt).toBeInstanceOf(Date);
  });

  it("keeps execution, task drafts and learning cards strict", () => {
    expect(pluginExecutionContextSchema.safeParse({
      execution: "background",
      runId: null,
      userInitiated: false,
    }).success).toBe(false);
    expect(pluginTaskDraftRequestSchema.safeParse({
      intent: "review",
      activityId: "memorization.review",
      title: "复习",
      prompt: "打开活动复习。",
      runAt: "2026-10-01T08:00:00.000Z",
      createImmediately: true,
    }).success).toBe(false);
    expect(learningCardContentSchema.parse({
      front: "什么是实践检验？",
      back: "以实践结果检验认识是否符合客观实际。",
      reason: "复习判断标准",
      tags: ["认识论"],
    })).toMatchObject({ tags: ["认识论"] });
    expect(learningCardDraftSchema.parse({
      schemaVersion: 1,
      source: {
        pluginId: "study.problem-solving",
        activityId: "problem-solving.practice",
        recordId: "attempt-1",
      },
      content: {
        front: "如何避免同类错误？",
        back: "先核对条件，再检查关键推导。",
        reason: "迁移错因",
        tags: ["错题"],
      },
    })).toMatchObject({ source: { pluginId: "study.problem-solving" } });
  });

  it("resolves only precompiled activities owned by the declaring plugin", () => {
    expect(FIRST_PARTY_PLUGIN_ACTIVITIES).toHaveLength(3);
    expect(listPluginActivities("entertainment.quick-adventure", ["quick-adventure.setup"]))
      .toMatchObject([{ route: "/entertainment/quick-adventure", platforms: ["web", "android"] }]);
    expect(listPluginActivities("study.memorization", ["memorization.review"]))
      .toMatchObject([{ route: "/study/memorization", platforms: ["web", "android"] }]);
    expect(listPluginActivities("study.memorization", ["problem-solving.practice"]))
      .toEqual([]);
    expect(hasValidActivityContributions(
      "study.problem-solving",
      ["problem-solving.practice"],
    )).toBe(true);
    expect(hasValidActivityContributions("study.problem-solving", []))
      .toBe(false);
    expect(ownsRegisteredActivity("study.problem-solving", "memorization.review"))
      .toBe(false);
  });
});
