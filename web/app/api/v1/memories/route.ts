import { getMemoryApi } from "@/lib/api/memoryApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getMemoryApi().list();
}
