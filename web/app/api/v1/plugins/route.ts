import { getPluginApi } from "@/lib/api/pluginApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return getPluginApi().list();
}
