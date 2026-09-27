import { getMemoryApi } from "@/lib/api/memoryApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  const { id } = await context.params;
  return getMemoryApi().update(id, request);
}

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const { id } = await context.params;
  return getMemoryApi().delete(id, request);
}
