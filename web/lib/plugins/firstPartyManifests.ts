export const FIRST_PARTY_PLUGIN_MANIFESTS: readonly unknown[] = [
  {
    schemaVersion: "1",
    id: "study.memorization",
    name: "背书训练",
    description:
      "把学习材料拆成可校对的知识单元，进行复述、反馈和间隔复习。Phase 7.3 将实现完整活动。",
    version: "0.1.0",
    pluginApiVersion: ">=0.1.0 <0.2.0",
    kind: "activity",
    source: "first-party",
    availability: "foundation",
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
      "支持提示、逐步引导、答案检查和错因记录。Phase 7.4 将实现完整活动。",
    version: "0.1.0",
    pluginApiVersion: ">=0.1.0 <0.2.0",
    kind: "activity",
    source: "first-party",
    availability: "foundation",
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
