import { z } from "zod";
import { createGameSessionSchema } from "@/lib/game/contracts";
import type { GameRulePackDescriptor } from "@/lib/gameRulePacks/contracts";

export const QUICK_ADVENTURE_RULE_PACK_ID = "quick-adventure.d20";

export const QUICK_ADVENTURE_SCENARIOS = [
  {
    id: "mist-harbor",
    name: "雾港来信",
    worldName: "雾港",
    premise: "你带着一封没有署名的旧信来到雾港。钟楼在午夜响了第十三声，信上的印记与失踪的守灯人有关。你从港口酒馆开始调查，并决定相信谁。",
    role: "雾港调查员",
    goal: "查明旧信与守灯人失踪的联系",
    rule: "调查必须提供可观察的线索；关键线索不会因一次失败永久消失。",
  },
  {
    id: "star-ruins",
    name: "星灯遗迹",
    worldName: "星灯群岛",
    premise: "群岛的导航星灯逐一熄灭。你抵达废弃的观测站，发现一台仍在运转的星图仪。你要在下一场风暴来临前寻找能源，并决定如何处置遗迹中的秘密。",
    role: "遗迹探险者",
    goal: "寻找能重新点亮导航星灯的能源",
    rule: "探索应提供可选择的路径、资源代价和可验证的遗迹线索。",
  },
] as const;

export const QUICK_ADVENTURE_ATTRIBUTES = ["体魄", "灵巧", "意志"] as const;
export const QUICK_ADVENTURE_TONES = {
  warm: "温暖、有悬念，危险保持克制；强调合作与希望。",
  mysterious: "悬疑、沉浸、克制；线索清晰，不描写血腥细节。",
} as const;

export const quickAdventureSetupSchema = z.object({
  scenarioId: z.enum(["mist-harbor", "star-ruins"]),
  heroName: z.string().trim().min(1).max(80),
  specialty: z.enum(QUICK_ADVENTURE_ATTRIBUTES),
  tone: z.enum(["warm", "mysterious"]),
  boundaries: z.array(z.string().trim().min(1).max(300)).max(16)
    .transform((items) => [...new Set(items)]),
}).strict();

export type QuickAdventureSetup = z.infer<typeof quickAdventureSetupSchema>;

export const DEFAULT_QUICK_ADVENTURE_SETUP: QuickAdventureSetup = {
  scenarioId: "mist-harbor",
  heroName: "林舟",
  specialty: "意志",
  tone: "mysterious",
  boundaries: ["不描写血腥细节"],
};

export const QUICK_ADVENTURE_DESCRIPTOR: GameRulePackDescriptor = {
  id: QUICK_ADVENTURE_RULE_PACK_ID,
  pluginId: "entertainment.quick-adventure",
  activityId: "quick-adventure.setup",
  version: "1.0.0",
  name: "轻量冒险",
  description: "三个属性、10 点生命和轻量 d20 检定，适合独自体验短篇 AI 跑团。",
  promptLayer: [
    "你担任轻量冒险的主持人：每回合推进一个场景，提供可执行的选择，保留玩家决定角色行动的权利。",
    "无需检定的行动直接推进；有风险时提出属性、难度和后果建议，由玩家在宿主界面显式发起检定。",
    "检定使用 1d20 + 属性值；常规难度为 10，困难为 15，极难为 20。只引用宿主提供的可信结果。",
    "自然骰面 20 为大成功、1 为大失败；其他情况总值达到难度为成功，否则失败。",
    "失败带来代价或新局面并推进剧情；不得擅自宣称已掷骰、已检定或改变可信结果。",
    "记录场景事实、出口、目标、角色生命与状态、资源和结构化物品；生命为 0 表示失去行动能力，先与玩家确认后续安排。",
  ],
  hostContracts: {
    tools: ["dice.roll.v1", "rule-check.v1"],
    state: "game-state.v2",
    stateFields: ["scene", "sceneFacts", "sceneExits", "objectives", "flags", "resources", "inventory", "characters", "items"],
  },
};

export function buildQuickAdventureSession(rawSetup: unknown) {
  const setup = quickAdventureSetupSchema.parse(rawSetup);
  const scenario = QUICK_ADVENTURE_SCENARIOS.find((item) => item.id === setup.scenarioId)!;
  const boundaries = [...new Set([
    "不把虚构设定冒充现实事实",
    "尊重玩家设定的内容边界，不强迫玩家角色作出选择",
    ...setup.boundaries,
  ])];
  return createGameSessionSchema.parse({
    title: `${scenario.name} · ${setup.heroName}`,
    kind: "tabletop",
    world: {
      name: scenario.worldName,
      premise: scenario.premise,
      tone: QUICK_ADVENTURE_TONES[setup.tone],
      rules: [
        `规则包：${QUICK_ADVENTURE_DESCRIPTOR.name}（${QUICK_ADVENTURE_RULE_PACK_ID}）v${QUICK_ADVENTURE_DESCRIPTOR.version}`,
        ...QUICK_ADVENTURE_DESCRIPTOR.promptLayer,
        scenario.rule,
        "角色初始生命上限为 10；擅长属性为 +3，其他属性为 +1。",
      ],
      boundaries,
    },
    initialCharacter: {
      name: setup.heroName,
      role: scenario.role,
      controller: "user",
      description: `${setup.heroName}以${setup.specialty}见长，刚刚抵达${scenario.worldName}。`,
      personality: "谨慎而好奇，愿意观察、合作并作出自己的决定。",
      goals: [scenario.goal],
      boundaries: setup.boundaries,
      attributes: Object.fromEntries(QUICK_ADVENTURE_ATTRIBUTES.map((name) => [
        name, name === setup.specialty ? 3 : 1,
      ])),
      maxHealth: 10,
    },
  });
}
