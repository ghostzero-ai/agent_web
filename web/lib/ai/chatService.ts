import {
  getApiKey,
  getApiBaseUrl,
  getApiModel,
  validateConfig,
  type ChatMessage,
} from "@/lib/config";

/**
 * 发送消息到 AI API，返回 assistant 回复内容。
 * 纯函数，不依赖 React，不处理 UI state。
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const config = validateConfig();
  if (!config.valid) {
    throw new Error(
      `请先配置：${config.missing.join("、")}`
    );
  }

  const apiKey = getApiKey()!;
  const baseUrl = getApiBaseUrl()!.replace(/\/+$/, "");
  const model = getApiModel()!;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`API 返回错误：${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "（AI 未返回内容）";
}
