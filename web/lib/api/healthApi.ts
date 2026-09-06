import { sql } from "drizzle-orm";
import type { ModelProviderStatus } from "@/lib/ai/server/modelConfig";
import { resolveModelProviderStatus } from "@/lib/ai/server/modelCredentialService";
import { getDatabase } from "@/lib/db/client";

type HealthApiDependencies = {
  checkDatabase: () => Promise<void>;
  getModelStatus: () => ModelProviderStatus | Promise<ModelProviderStatus>;
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

      let model: ModelProviderStatus = {
        configured: false,
        baseUrl: null,
        model: null,
        missing: [],
      };
      if (databaseReady) {
        try {
          model = await dependencies.getModelStatus();
        } catch (error) {
          databaseReady = false;
          console.error(`[health:${requestId}] Model status check failed`, {
            name: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
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
    getModelStatus: resolveModelProviderStatus,
    now: () => new Date(),
  });
}
