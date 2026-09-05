// ── Task Planner ──
// 基于关键词匹配生成任务步骤列表。
// 纯函数，不执行，无副作用。

const PLAN_PATTERNS: Array<{ keywords: string[]; steps: string[] }> = [
  {
    keywords: ["总结", "摘要", "概括", "回顾"],
    steps: ["读取对话记录", "提取关键信息", "生成摘要", "写入记忆"],
  },
  {
    keywords: ["分析", "评估", "判断"],
    steps: ["读取对话记录", "识别核心主题", "多角度分析", "生成分析报告"],
  },
  {
    keywords: ["计划", "安排", "规划"],
    steps: ["明确目标", "拆解任务", "排列优先级", "生成执行计划"],
  },
  {
    keywords: ["比较", "对比", "区别"],
    steps: ["提取对比项", "列举异同点", "结构化输出", "给出建议"],
  },
];

const DEFAULT_STEPS = ["理解用户输入", "检索相关知识", "生成回复"];

export function planTask(input: string): string[] {
  const lower = input.toLowerCase();

  for (const pattern of PLAN_PATTERNS) {
    if (pattern.keywords.some((kw) => lower.includes(kw))) {
      return pattern.steps;
    }
  }

  return DEFAULT_STEPS;
}
