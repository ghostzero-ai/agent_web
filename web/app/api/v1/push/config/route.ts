import { getPushApi } from "@/lib/api/pushApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getPushApi().getConfiguration();
}
