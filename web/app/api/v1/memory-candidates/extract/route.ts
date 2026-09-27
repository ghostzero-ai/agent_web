import { getMemoryCandidateApi } from "@/lib/api/memoryCandidateApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return getMemoryCandidateApi().extract(request);
}
