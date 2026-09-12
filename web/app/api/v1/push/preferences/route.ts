import { getPushApi } from "@/lib/api/pushApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PATCH(request: Request): Promise<Response> {
  return getPushApi().updatePreferences(request);
}
