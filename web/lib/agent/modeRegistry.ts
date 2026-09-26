export type CoreModeId =
  | "auto"
  | "professional"
  | "companion"
  | "reflection"
  | "entertainment";

export type ModeDefinition<Id extends string = string> = {
  id: Id;
  label: string;
  purpose: string;
  instruction: string;
  factStandard: "strict" | "strict-with-empathy" | "reflective" | "fiction-separated";
  defaultTools: readonly string[];
  persistence: "conversation" | "conversation-and-memory" | "game-session";
};

function validateDefinition(definition: ModeDefinition): void {
  if (
    !/^[a-z][a-z0-9-]{0,63}$/.test(definition.id) ||
    !definition.label.trim() ||
    !definition.instruction.trim()
  ) {
    throw new Error("Mode definition requires an id, label, and instruction");
  }
  if (definition.instruction.length > 8_000) {
    throw new Error(`Mode ${definition.id} instruction is too long`);
  }
}

function freezeDefinition<Id extends string>(
  definition: ModeDefinition<Id>,
): ModeDefinition<Id> {
  return Object.freeze({
    ...definition,
    defaultTools: Object.freeze([...definition.defaultTools]),
  });
}

export class ModeRegistry<Id extends string = string> {
  private readonly definitions = new Map<Id, ModeDefinition<Id>>();

  register(definition: ModeDefinition<Id>): this {
    validateDefinition(definition);
    if (this.definitions.has(definition.id)) {
      throw new Error(`Mode ${definition.id} is already registered`);
    }
    this.definitions.set(definition.id, freezeDefinition(definition));
    return this;
  }

  get(id: Id): ModeDefinition<Id> {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Mode ${id} is not registered`);
    return definition;
  }

  has(id: string): id is Id {
    return this.definitions.has(id as Id);
  }

  list(): readonly ModeDefinition<Id>[] {
    return Object.freeze([...this.definitions.values()]);
  }
}

export const CORE_MODE_DEFINITIONS: readonly ModeDefinition<CoreModeId>[] = Object.freeze([
  {
    id: "auto",
    label: "自动",
    purpose: "根据当前问题调整解释深度和语气，同时保持统一事实标准。",
    instruction:
      "根据用户当前意图在专业解答、自然交流和反思引导之间调整表达；涉及事实、技术、研究或高风险内容时自动采用严谨标准。",
    factStandard: "strict",
    defaultTools: [],
    persistence: "conversation",
  },
  {
    id: "professional",
    label: "专业",
    purpose: "用于学习、研究、解题与需要可核查结论的工作。",
    instruction:
      "优先给出清晰、结构化、可核查的专业回答；区分事实、推断与不确定性，必要时说明验证路径。",
    factStandard: "strict",
    defaultTools: ["search", "citation", "calculator"],
    persistence: "conversation",
  },
  {
    id: "companion",
    label: "陪伴",
    purpose: "提供自然、有连续性的交流和情绪支持。",
    instruction:
      "语气自然、温和并关注用户感受，可以主动提出贴合上下文的问题；涉及客观事实时不得为了安慰而歪曲结论。",
    factStandard: "strict-with-empathy",
    defaultTools: ["memory"],
    persistence: "conversation-and-memory",
  },
  {
    id: "reflection",
    label: "反思",
    purpose: "通过高质量问题帮助用户澄清目标、假设与选择。",
    instruction:
      "先理解用户正在面对的判断或困境，再提出少量具体且有推进作用的问题；不要用机械反问代替必要的直接回答。",
    factStandard: "reflective",
    defaultTools: ["memory"],
    persistence: "conversation-and-memory",
  },
  {
    id: "entertainment",
    label: "娱乐",
    purpose: "承载角色扮演、互动故事与 AI 跑团。",
    instruction:
      "可以在明确的虚构设定中扮演角色和推进叙事，但必须区分世界内事实与现实事实；退出虚构语境后恢复普通回答契约。",
    factStandard: "fiction-separated",
    defaultTools: ["dice", "character-sheet", "scene-state"],
    persistence: "game-session",
  },
]);

export function createModeRegistry(
  definitions: readonly ModeDefinition<CoreModeId>[] = CORE_MODE_DEFINITIONS,
): ModeRegistry<CoreModeId> {
  const registry = new ModeRegistry<CoreModeId>();
  for (const definition of definitions) registry.register(definition);
  return registry;
}

export const coreModeRegistry = createModeRegistry();

export function isCoreModeId(value: unknown): value is CoreModeId {
  return typeof value === "string" && coreModeRegistry.has(value);
}
