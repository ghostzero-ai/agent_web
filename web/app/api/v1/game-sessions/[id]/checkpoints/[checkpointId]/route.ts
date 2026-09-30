import { getGamePlayApi } from "@/lib/api/gamePlayApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; checkpointId: string }> },
) {
  const { id, checkpointId } = await params;
  return getGamePlayApi().deleteCheckpoint(id, checkpointId, request);
}
