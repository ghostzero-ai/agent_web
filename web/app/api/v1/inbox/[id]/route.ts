import { getInboxApi } from "@/lib/api/inboxApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InboxRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: InboxRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getInboxApi().update(id, request);
}

export async function DELETE(
  _request: Request,
  context: InboxRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getInboxApi().delete(id);
}
