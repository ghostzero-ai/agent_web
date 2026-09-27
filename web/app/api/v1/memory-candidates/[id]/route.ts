import { getMemoryCandidateApi } from "@/lib/api/memoryCandidateApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  const { id } = await context.params;
  return getMemoryCandidateApi().resolve(id, request);
}
