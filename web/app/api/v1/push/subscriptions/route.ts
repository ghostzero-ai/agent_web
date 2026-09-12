import { getPushApi } from "@/lib/api/pushApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return getPushApi().saveSubscription(request);
}
