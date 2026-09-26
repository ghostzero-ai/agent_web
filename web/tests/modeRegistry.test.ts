import { describe, expect, it } from "vitest";
import {
  CORE_MODE_DEFINITIONS,
  ModeRegistry,
  coreModeRegistry,
  createModeRegistry,
  isCoreModeId,
} from "@/lib/agent/modeRegistry";

describe("Mode Registry", () => {
  it("registers the five core interaction modes", () => {
    expect(coreModeRegistry.list().map((mode) => mode.id)).toEqual([
      "auto",
      "professional",
      "companion",
      "reflection",
      "entertainment",
    ]);
    expect(coreModeRegistry.get("professional")).toMatchObject({
      factStandard: "strict",
      persistence: "conversation",
    });
    expect(coreModeRegistry.get("entertainment")).toMatchObject({
      factStandard: "fiction-separated",
      persistence: "game-session",
    });
  });

  it("rejects duplicate registrations and unknown lookups", () => {
    const registry = new ModeRegistry().register(CORE_MODE_DEFINITIONS[0]);
    expect(() => registry.register(CORE_MODE_DEFINITIONS[0])).toThrow(
      "already registered",
    );
    expect(() => registry.get("professional")).toThrow("not registered");
  });

  it("copies and freezes definitions so callers cannot mutate registry policy", () => {
    const source = {
      ...CORE_MODE_DEFINITIONS[1],
      defaultTools: [...CORE_MODE_DEFINITIONS[1].defaultTools],
    };
    const registry = createModeRegistry([source]);
    source.instruction = "已被外部修改";
    source.defaultTools.push("unsafe-tool");

    expect(registry.get("professional").instruction).not.toContain("外部修改");
    expect(registry.get("professional").defaultTools).not.toContain("unsafe-tool");
    expect(Object.isFrozen(registry.get("professional"))).toBe(true);
  });

  it("validates persisted mode identifiers", () => {
    expect(isCoreModeId("companion")).toBe(true);
    expect(isCoreModeId("unknown-mode")).toBe(false);
  });

  it("allows an isolated extension registry without widening core modes", () => {
    const extensionRegistry = new ModeRegistry<string>().register({
      id: "vocabulary-coach",
      label: "背词教练",
      purpose: "插件提供的学习交互协议。",
      instruction: "使用间隔复习提问，但不能覆盖核心 Policy。",
      factStandard: "strict",
      defaultTools: ["flashcards"],
      persistence: "conversation",
    });

    expect(extensionRegistry.get("vocabulary-coach").defaultTools).toEqual([
      "flashcards",
    ]);
    expect(isCoreModeId("vocabulary-coach")).toBe(false);
  });
});
