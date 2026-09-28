import { getPluginCapabilityApi } from "@/lib/api/pluginCapabilityApi";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; capability: string }> },
) {
  const { id, capability } = await params;
  return getPluginCapabilityApi().grant(id, capability, request);
}
