import { getGameSessionApi } from "@/lib/api/gameSessionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return getGameSessionApi().createCharacter(id, request);
}
