import { getProblemSolvingApi } from "@/lib/api/problemSolvingApi";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/problem-solving/[id]">,
) {
  const { id } = await context.params;
  return getProblemSolvingApi().get(id);
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/problem-solving/[id]">,
) {
  const { id } = await context.params;
  return getProblemSolvingApi().delete(id, request);
}
