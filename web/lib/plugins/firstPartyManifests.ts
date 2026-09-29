import { FIRST_PARTY_PLUGIN_API_RANGE } from "@/lib/plugins/pluginApiV1";

export const FIRST_PARTY_PLUGIN_MANIFESTS: readonly unknown[] = [
  {
    schemaVersion: "1",
    id: "study.memorization",
    name: "背书训练",
    description:
      "把学习材料拆成可校对的知识单元，进行复述评分、薄弱点记录和间隔复习。",
    version: "1.0.0",
    pluginApiVersion: FIRST_PARTY_PLUGIN_API_RANGE,
    kind: "activity",
    source: "first-party",
    availability: "available",
    contributions: {
      skills: ["memorization.feedback"],
      tools: [],
      activities: ["memorization.review"],
      backgroundJobs: [],
    },
    requestedCapabilities: [
      "model.generate",
      "storage.read-write",
      "task.create-draft",
    ],
  },
  {
    schemaVersion: "1",
    id: "study.problem-solving",
    name: "解题训练",
    description:
      "支持文字/图片题目、提示、逐步引导、答案检查、错因记录和复习卡。",
    version: "1.0.0",
    pluginApiVersion: FIRST_PARTY_PLUGIN_API_RANGE,
    kind: "activity",
    source: "first-party",
    availability: "available",
    contributions: {
      skills: ["problem-solving.guidance"],
      tools: [],
      activities: ["problem-solving.practice"],
      backgroundJobs: [],
    },
    requestedCapabilities: [
      "model.generate",
      "storage.read-write",
      "task.create-draft",
    ],
  },
] as const;
