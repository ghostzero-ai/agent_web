import { getConversationApi } from "@/lib/api/conversationApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: Request,
  context: ConversationRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getConversationApi().setActiveLeaf(id, request);
}
