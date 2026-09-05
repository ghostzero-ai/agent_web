import { getModelApi } from "@/lib/api/modelApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return getModelApi().stream(request);
}
