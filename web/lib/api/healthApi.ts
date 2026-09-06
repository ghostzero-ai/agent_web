import { sql } from "drizzle-orm";
import { getModelProviderStatus, type ModelProviderStatus } from "@/lib/ai/server/modelConfig";
import { getDatabase } from "@/lib/db/client";

type HealthApiDependencies = {
  checkDatabase: () => Promise<void>;
  getModelStatus: () => ModelProviderStatus;
  now: () => Date;
};

export function createHealthApi(dependencies: HealthApiDependencies) {
  return {
    async check(): Promise<Response> {
      const requestId = crypto.randomUUID();
      const headers = {
        "cache-control": "no-store",
        "x-request-id": requestId,
      };
      let databaseReady = false;
      try {
        await dependencies.checkDatabase();
        databaseReady = true;
      } catch (error) {
        console.error(`[health:${requestId}] Database health check failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }

      const model = dependencies.getModelStatus();
      const status = !databaseReady
        ? "unhealthy"
        : model.configured
          ? "healthy"
          : "degraded";

      return Response.json(
        {
          data: {
            status,
            timestamp: dependencies.now().toISOString(),
            checks: {
              database: databaseReady ? "ready" : "unavailable",
              modelProvider: model.configured ? "configured" : "not_configured",
            },
          },
        },
        { status: databaseReady ? 200 : 503, headers },
      );
    },
  };
}

export function getHealthApi() {
  return createHealthApi({
    async checkDatabase() {
      await getDatabase().execute(sql`select 1`);
    },
    getModelStatus: getModelProviderStatus,
    now: () => new Date(),
  });
}
