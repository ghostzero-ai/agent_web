import { getGameSessionApi } from "@/lib/api/gameSessionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; characterId: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id, characterId } = await context.params;
  return getGameSessionApi().updateCharacter(id, characterId, request);
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { id, characterId } = await context.params;
  return getGameSessionApi().deleteCharacter(id, characterId, request);
}
