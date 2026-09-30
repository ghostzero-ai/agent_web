import { getGamePlayApi } from "@/lib/api/gamePlayApi";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return getGamePlayApi().updateStatus(id, request);
}
