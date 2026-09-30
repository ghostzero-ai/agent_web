import { getGamePlayApi } from "@/lib/api/gamePlayApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return getGamePlayApi().createCheckpoint(id, request);
}
