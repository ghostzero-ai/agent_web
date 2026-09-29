import { getMemorizationApi } from "@/lib/api/memorizationApi";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/memorization/[id]/review">,
) {
  const { id } = await context.params;
  return getMemorizationApi().review(id, request);
}
