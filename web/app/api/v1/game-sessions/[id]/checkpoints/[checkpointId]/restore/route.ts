import { getGamePlayApi } from "@/lib/api/gamePlayApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; checkpointId: string }> },
) {
  const { id, checkpointId } = await params;
  return getGamePlayApi().restoreCheckpoint(id, checkpointId, request);
}
