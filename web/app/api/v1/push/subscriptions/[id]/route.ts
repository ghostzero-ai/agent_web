import { getPushApi } from "@/lib/api/pushApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PushSubscriptionRouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  _request: Request,
  context: PushSubscriptionRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getPushApi().deleteSubscription(id);
}
