import { getGamePlayApi } from "@/lib/api/gamePlayApi";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return getGamePlayApi().createTurn(id, request);
}
