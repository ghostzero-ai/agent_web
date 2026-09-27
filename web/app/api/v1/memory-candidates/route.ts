import { getMemoryCandidateApi } from "@/lib/api/memoryCandidateApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return getMemoryCandidateApi().list(
    new URL(request.url).searchParams.get("filter"),
  );
}
