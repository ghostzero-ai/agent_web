import { getTaskApi } from "@/lib/api/taskApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: TaskRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getTaskApi().get(id);
}

export async function PATCH(
  request: Request,
  context: TaskRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getTaskApi().update(id, request);
}

export async function DELETE(
  _request: Request,
  context: TaskRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getTaskApi().delete(id);
}
