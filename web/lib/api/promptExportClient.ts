import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import type { PromptExportFormat } from "@/lib/ai/promptExport";
import type { PromptExportArtifact } from "@/lib/platform/capabilities";
import { apiFetch } from "@/lib/api/clientRuntime";

export async function exportPromptEnvelope(
  envelope: PromptEnvelope,
  format: PromptExportFormat,
  includeMemory: boolean,
): Promise<PromptExportArtifact> {
  const response = await apiFetch("/api/v1/model/prompt-export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ envelope, format, includeMemory }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `Prompt 导出失败：${response.status}`,
    );
  }
  const body = (await response.json()) as { data: PromptExportArtifact };
  return body.data;
}
