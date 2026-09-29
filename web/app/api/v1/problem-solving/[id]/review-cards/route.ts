import { getProblemSolvingApi } from "@/lib/api/problemSolvingApi";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/problem-solving/[id]/review-cards">,
) {
  const { id } = await context.params;
  return getProblemSolvingApi().createReviewCard(id, request);
}
