import { getGameRulePackApi } from "@/lib/api/gameRulePackApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/v1/game-rule-packs/[id]">) {
  return getGameRulePackApi().getSetup((await context.params).id);
}

export async function POST(request: Request, context: RouteContext<"/api/v1/game-rule-packs/[id]">) {
  return getGameRulePackApi().prepareDraft((await context.params).id, request);
}
