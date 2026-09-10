import { getInboxApi } from "@/lib/api/inboxApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return getInboxApi().list(new URL(request.url).searchParams.get("filter"));
}
