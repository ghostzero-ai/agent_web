import { getGameSessionApi } from "@/lib/api/gameSessionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return getGameSessionApi().get(id);
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return getGameSessionApi().update(id, request);
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return getGameSessionApi().delete(id, request);
}
