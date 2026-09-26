import {
  toChatCompletionMessages,
  type ModelRequestMetadata,
  type PromptMessage,
} from "@/lib/ai/messages";
import type { PromptExportArtifact } from "@/lib/platform/capabilities";

export type PromptRequestSnapshot = {
  snapshotId: string;
  capturedAt: string;
  trigger: "send" | "retry";
  conversation: {
    id: string;
    title: string;
    activeLeafId: string | null;
  };
  prompt: PromptMessage[];
  modelRequest: ModelRequestMetadata | null;
};

export type PromptExportFormat = "json" | "markdown";

export type PromptExportDocument = {
  format: "ai-study-companion.prompt-export";
  schemaVersion: 1;
  exportedAt: string;
  capturedAt: string;
  trigger: PromptRequestSnapshot["trigger"];
  conversation: PromptRequestSnapshot["conversation"];
  provider: ModelRequestMetadata | null;
  request: {
    transport: "openai-compatible-chat-completions";
    stream: true;
    messages: ReturnType<typeof toChatCompletionMessages>;
  };
  promptLayers: PromptMessage[];
  privacy: {
    exactRequestContent: boolean;
    memoryIncluded: boolean;
    redactedSources: Array<"memory">;
    alwaysExcluded: string[];
  };
  integrity: {
    algorithm: "SHA-256";
    scope: "exported-request-and-layers";
    contentHash: string;
  };
};

const REDACTED_MEMORY = "[记忆上下文已从导出文件中移除；勾选“包含记忆上下文”可导出完整内容。]";

function exportedPrompt(
  prompt: readonly PromptMessage[],
  includeMemory: boolean,
): PromptMessage[] {
  return prompt.map((message) =>
    message.source === "memory" && !includeMemory
      ? { ...message, content: REDACTED_MEMORY }
      : { ...message },
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function filenamePart(title: string): string {
  const normalized = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || "conversation";
}

function timestampPart(value: string): string {
  return value.replace(/[-:.]/g, "");
}

function fenced(content: string): string {
  let longest = 2;
  for (const match of content.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${content}\n${fence}`;
}

export async function createPromptExportDocument(
  snapshot: PromptRequestSnapshot,
  options: { includeMemory: boolean; exportedAt?: string },
): Promise<PromptExportDocument> {
  const promptLayers = exportedPrompt(snapshot.prompt, options.includeMemory);
  const hasMemory = snapshot.prompt.some((message) => message.source === "memory");
  const request = {
    transport: "openai-compatible-chat-completions" as const,
    stream: true as const,
    messages: toChatCompletionMessages(promptLayers),
  };
  const integrityInput = JSON.stringify({
    provider: snapshot.modelRequest,
    request,
    promptLayers,
  });

  return {
    format: "ai-study-companion.prompt-export",
    schemaVersion: 1,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    capturedAt: snapshot.capturedAt,
    trigger: snapshot.trigger,
    conversation: { ...snapshot.conversation },
    provider: snapshot.modelRequest ? { ...snapshot.modelRequest } : null,
    request,
    promptLayers,
    privacy: {
      exactRequestContent: !hasMemory || options.includeMemory,
      memoryIncluded: hasMemory && options.includeMemory,
      redactedSources: hasMemory && !options.includeMemory ? ["memory"] : [],
      alwaysExcluded: [
        "model API key",
        "database credentials",
        "push tokens",
        "internal error stacks",
      ],
    },
    integrity: {
      algorithm: "SHA-256",
      scope: "exported-request-and-layers",
      contentHash: await sha256(integrityInput),
    },
  };
}

export function serializePromptExportMarkdown(
  document: PromptExportDocument,
): string {
  const provider = document.provider;
  const lines = [
    "# Prompt 导出",
    "",
    `- 对话：${document.conversation.title}`,
    `- 捕获时间：${document.capturedAt}`,
    `- 导出时间：${document.exportedAt}`,
    `- 触发方式：${document.trigger === "retry" ? "重新生成" : "发送消息"}`,
    `- Provider：${provider?.provider ?? "未取得元数据"}`,
    `- Base URL：${provider?.baseUrl ?? "未取得元数据"}`,
    `- Model：${provider?.model ?? "未取得元数据"}`,
    `- Request ID：${provider?.requestId ?? "未取得元数据"}`,
    `- 记忆上下文：${document.privacy.memoryIncluded ? "已包含" : document.privacy.redactedSources.length ? "已脱敏" : "本次请求没有记忆层"}`,
    `- 内容哈希：${document.integrity.contentHash}`,
    "",
    "> API Key、数据库凭据、Push Token 与内部错误栈始终不会进入导出文件。",
    "",
    "## Prompt 层",
    "",
  ];

  document.promptLayers.forEach((message, index) => {
    lines.push(
      `### ${index + 1}. ${message.kind} / ${message.source} / ${message.role}`,
      "",
      fenced(message.content),
      "",
    );
  });

  return `${lines.join("\n").trimEnd()}\n`;
}

export async function createPromptExportArtifact(
  snapshot: PromptRequestSnapshot,
  format: PromptExportFormat,
  options: { includeMemory: boolean; exportedAt?: string },
): Promise<PromptExportArtifact> {
  const document = await createPromptExportDocument(snapshot, options);
  const extension = format === "json" ? "json" : "md";
  const content =
    format === "json"
      ? `${JSON.stringify(document, null, 2)}\n`
      : serializePromptExportMarkdown(document);
  return {
    filename: `prompt-${filenamePart(snapshot.conversation.title)}-${timestampPart(document.exportedAt)}.${extension}`,
    mediaType: format === "json" ? "application/json" : "text/markdown",
    content,
  };
}
