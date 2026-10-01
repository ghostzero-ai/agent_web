import { expect, it } from "vitest";
import { runTokenCostEval } from "@/evals/r1/tokenCostEval";

it("provides a repeatable no-network structural baseline without inventing token or billing figures", () => {
  const result = runTokenCostEval();
  expect(result).toEqual(runTokenCostEval());
  expect(result.cases).toHaveLength(7);
  expect(result.modelCalls).toBe(0);
  expect(result.cases.every((item) => item.actualInputTokens === null && item.actualCachedTokens === null && item.actualCost === null)).toBe(true);
  const game = result.cases.find((item) => item.name === "game-dynamic-snapshot")!;
  expect(game.afterSharedJsonPrefixCharacters).toBeGreaterThan(game.beforeSharedJsonPrefixCharacters);
  const long = result.cases.find((item) => item.name === "long-chat-no-lossy-summary")!;
  expect(long.afterInputCharacters).toBe(long.beforeInputCharacters);
  const search = result.cases.find((item) => item.name === "search-evidence-metadata")!;
  expect(search.afterInputCharacters).toBeLessThan(search.beforeInputCharacters);
});
