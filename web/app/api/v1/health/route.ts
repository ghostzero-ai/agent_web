import { getHealthApi } from "@/lib/api/healthApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getHealthApi().check();
}
