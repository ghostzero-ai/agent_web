import { summarizeModelCalls, type ModelCallTelemetry } from "@/lib/ai/modelUsage";

export type ModelUsageOverview = {
  since: string; until: string; recordedCalls: number; truncated: boolean;
  groups: ReturnType<typeof summarizeModelCalls>;
};

export function createModelUsageApi(repository: { list(since: Date): Promise<{ calls: ModelCallTelemetry[]; truncated: boolean }> }, now: () => Date = () => new Date()) {
  return {
    async get(): Promise<Response> {
      const until = now();
      const since = new Date(until.getTime() - 7 * 86400_000);
      try {
        const { calls, truncated } = await repository.list(since);
        const data: ModelUsageOverview = { since: since.toISOString(), until: until.toISOString(), recordedCalls: calls.length, truncated, groups: summarizeModelCalls(calls) };
        return Response.json({ data }, { headers: { "cache-control": "no-store" } });
      } catch {
        return Response.json({ error: { code: "MODEL_USAGE_UNAVAILABLE", message: "暂时无法读取模型用量。" } }, { status: 503, headers: { "cache-control": "no-store" } });
      }
    },
  };
}
