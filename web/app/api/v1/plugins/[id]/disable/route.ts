import { getPluginApi } from "@/lib/api/pluginApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PluginRouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: PluginRouteContext) {
  const { id } = await context.params;
  return getPluginApi().disable(id, request);
}
