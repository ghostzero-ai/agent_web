import { getConversationApi } from "@/lib/api/conversationApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: ConversationRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getConversationApi().appendMessage(id, request);
}
