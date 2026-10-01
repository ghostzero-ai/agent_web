import { createModelUsageApi } from "@/lib/api/modelUsageApi";
import { getDatabase } from "@/lib/db/client";
import { createModelUsageRepository } from "@/lib/repositories/modelUsageRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return createModelUsageApi(createModelUsageRepository(getDatabase())).get();
}
