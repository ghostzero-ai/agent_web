import { getDatabase } from "@/lib/db/client";
import { createModelUsageRepository } from "@/lib/repositories/modelUsageRepository";
import type { ModelProviderConfig } from "./modelConfig";
import { OpenAICompatibleProvider } from "./modelProvider";

export function createMeasuredProvider(config: ModelProviderConfig) {
  return new OpenAICompatibleProvider(config, async (call) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        createModelUsageRepository(getDatabase()).record(call),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Usage persistence timed out.")), 2000); }),
      ]);
    } finally { clearTimeout(timeout); }
  });
}
