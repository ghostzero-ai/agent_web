import { getConversationApi } from "@/lib/api/conversationApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getConversationApi().list();
}

export function POST(request: Request): Promise<Response> {
  return getConversationApi().create(request);
}
