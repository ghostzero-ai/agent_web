/** Stable compact JSON for structured context, not for rewriting user text. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, candidate: unknown) => {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return Object.fromEntries(Object.entries(candidate).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    }
    return candidate;
  });
}
