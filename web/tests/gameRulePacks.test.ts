import { describe, expect, it, vi } from "vitest";
import { createGameRulePackApi } from "@/lib/api/gameRulePackApi";
import { gameSessionDraftSchema } from "@/lib/gameRulePacks/contracts";
import {
  buildQuickAdventureSession,
  DEFAULT_QUICK_ADVENTURE_SETUP,
  QUICK_ADVENTURE_DESCRIPTOR,
  QUICK_ADVENTURE_RULE_PACK_ID,
  quickAdventureSetupSchema,
} from "@/lib/gameRulePacks/quickAdventure";
import { GameRulePackRegistry, getGameRulePackRegistry } from "@/lib/gameRulePacks/registry";
import { createGameRulePackService } from "@/lib/gameRulePacks/service";
import { getFirstPartyPluginRegistry } from "@/lib/plugins/pluginRegistry";
import { PluginCapabilityRepositoryError } from "@/lib/repositories/pluginCapabilityRepository";

function request(body: unknown) {
  return new Request("http://localhost/api/v1/game-rule-packs/quick-adventure.d20", {
    method: "POST", body: JSON.stringify(body),
  });
}

describe("entertainment Activity rule packs", () => {
  it.each(["mist-harbor", "star-ruins"] as const)("builds a host-compatible %s draft with rules, boundaries and character stats", (scenarioId) => {
    const draft = getGameRulePackRegistry().buildDraft(QUICK_ADVENTURE_RULE_PACK_ID, {
      ...DEFAULT_QUICK_ADVENTURE_SETUP,
      scenarioId,
      heroName: " 星禾 ",
      specialty: "灵巧",
      boundaries: ["不出现蜘蛛", "不出现蜘蛛"],
    });
    expect(gameSessionDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.source).toMatchObject({ rulePackId: QUICK_ADVENTURE_RULE_PACK_ID, rulePackVersion: "1.0.0" });
    expect(draft.session.initialCharacter).toMatchObject({
      name: "星禾", controller: "user", attributes: { 体魄: 1, 灵巧: 3, 意志: 1 }, maxHealth: 10,
    });
    expect(draft.session.world.boundaries.filter((value) => value === "不出现蜘蛛")).toHaveLength(1);
    expect(draft.session.world.rules.join("\n")).toContain("自然骰面 20 为大成功");
    expect(draft.session.world.rules.join("\n")).toContain(QUICK_ADVENTURE_RULE_PACK_ID);
  });

  it("registers another rule pack through the same host draft boundary", () => {
    const alternateId = "quick-adventure.moon";
    const registry = new GameRulePackRegistry([{
      descriptor: { ...QUICK_ADVENTURE_DESCRIPTOR, id: alternateId, name: "月岛冒险" },
      parseSetup: (input) => quickAdventureSetupSchema.parse(input),
      buildSession: (setup) => {
        const session = buildQuickAdventureSession(setup);
        return { ...session, world: { ...session.world, name: "月岛", rules: ["潮汐每次只能改变一个出口"] } };
      },
    }], getFirstPartyPluginRegistry());
    expect(registry.buildDraft(alternateId, DEFAULT_QUICK_ADVENTURE_SETUP))
      .toMatchObject({ source: { rulePackId: alternateId }, session: { world: { name: "月岛" } } });
    expect(() => new GameRulePackRegistry([{
      descriptor: { ...QUICK_ADVENTURE_DESCRIPTOR, activityId: "memorization.review" },
      parseSetup: (input) => input,
      buildSession: buildQuickAdventureSession,
    }], getFirstPartyPluginRegistry())).toThrow(/registered plugin activity/);
  });

  it("rejects invalid setup and invalid pack output before storing any configuration", async () => {
    const invoke = vi.fn();
    const service = createGameRulePackService(getGameRulePackRegistry(), { invoke });
    await expect(service.prepareDraft(QUICK_ADVENTURE_RULE_PACK_ID, {
      setup: { ...DEFAULT_QUICK_ADVENTURE_SETUP, specialty: "任意属性", injected: true },
      expectedVersion: 0,
    })).rejects.toThrow();
    const brokenRegistry = new GameRulePackRegistry([{
      descriptor: QUICK_ADVENTURE_DESCRIPTOR,
      parseSetup: (input) => quickAdventureSetupSchema.parse(input),
      buildSession: () => ({ ...buildQuickAdventureSession(DEFAULT_QUICK_ADVENTURE_SETUP), title: "" }),
    }], getFirstPartyPluginRegistry());
    await expect(createGameRulePackService(brokenRegistry, { invoke }).prepareDraft(
      QUICK_ADVENTURE_RULE_PACK_ID, { setup: DEFAULT_QUICK_ADVENTURE_SETUP, expectedVersion: 0 },
    )).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps unknown packs, malformed JSON, and client-supplied identities without invoking the gateway", async () => {
    const invoke = vi.fn();
    const api = createGameRulePackApi({ invoke });
    expect((await api.getSetup("unknown.pack")).status).toBe(404);
    expect((await api.prepareDraft(QUICK_ADVENTURE_RULE_PACK_ID, request({
      setup: DEFAULT_QUICK_ADVENTURE_SETUP, expectedVersion: 0, pluginId: "study.memorization",
    }))).status).toBe(400);
    const malformed = new Request("http://localhost/api", { method: "POST", body: "{" });
    const response = await api.prepareDraft(QUICK_ADVENTURE_RULE_PACK_ID, malformed);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("returns a quota error and does not leak an unexpected adapter error", async () => {
    const invoke = vi.fn()
      .mockRejectedValueOnce(new PluginCapabilityRepositoryError("CAPABILITY_QUOTA_EXCEEDED", "Quota exceeded."))
      .mockRejectedValueOnce(new Error("private-configuration-details"));
    const api = createGameRulePackApi({ invoke });
    expect((await api.getSetup(QUICK_ADVENTURE_RULE_PACK_ID)).status).toBe(429);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await api.getSetup(QUICK_ADVENTURE_RULE_PACK_ID);
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("private-configuration-details");
    } finally { log.mockRestore(); }
  });

  it("preserves incompatible stored setup instead of silently overwriting it", async () => {
    const invoke = vi.fn().mockResolvedValue({
      requestId: "test-request",
      data: {
        key: "rule-pack/setup/quick-adventure.d20",
        value: { schemaVersion: 1, rulePackId: "other-pack", rulePackVersion: "1.0.0", setup: {} },
        byteSize: 128, version: 4, updatedAt: new Date(),
      },
    });
    const response = await createGameRulePackApi({ invoke }).getSetup(QUICK_ADVENTURE_RULE_PACK_ID);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("GAME_RULE_PACK_SETUP_INVALID");
    expect(invoke).toHaveBeenCalledOnce();
  });
});
