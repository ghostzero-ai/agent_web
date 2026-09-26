import { getPromptExportApi } from "@/lib/api/promptExportApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return getPromptExportApi().create(request);
}
