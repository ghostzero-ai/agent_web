import { getLegacyImportApi } from "@/lib/api/legacyImportApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return getLegacyImportApi().execute(request);
}
