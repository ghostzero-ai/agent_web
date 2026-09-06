import { getModelApi } from "@/lib/api/modelApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getModelApi().status();
}
