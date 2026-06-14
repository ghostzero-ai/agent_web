import {
  getApiKey,
  getApiBaseUrl,
  getApiModel,
  validateConfig,
  type ChatMessage,
  type Session,
} from "@/lib/config";

/**
 * 纯 API 调用。signal 直接传入 fetch，支持 AbortController。
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const config = validateConfig();
  if (!config.valid) {
    throw new Error(`请先配置：${config.missing.join("、")}`);
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
    body: JSON.stringify({ model, messages }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`API 返回错误：${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "（AI 未返回内容）";
}

// ── 领域 Action（纯计算，只算不写）──

/**
 * 纯函数：将 AI 回复追加为新 assistant 消息，返回新 Session。
 * 不写 localStorage，不产生副作用。
 */
export function applySendReply(session: Session, reply: string): Session {
  const assistant: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: reply,
    createdAt: Date.now(),
    versions: [reply],
    activeVersion: 0,
  };

  return {
    ...session,
    messages: [...session.messages, assistant],
    updatedAt: Date.now(),
  };
}

/**
 * 纯函数：将 AI 回复更新到指定 assistant 的 versions，返回新 Session。
 * 不写 localStorage，不产生副作用。
 */
export function applyRetryReply(
  session: Session,
  reply: string,
  targetMsgIndex: number,
): Session {
  const msgs = [...session.messages];
  const target = msgs[targetMsgIndex];
  if (!target || target.role !== "assistant") {
    return session;
  }

  const versions = target.versions ?? [target.content];
  const newVersionIndex = versions.length;

  msgs[targetMsgIndex] = {
    ...target,
    content: reply,
    versions: [...versions, reply],
    activeVersion: newVersionIndex,
    createdAt: Date.now(),
  };

  return { ...session, messages: msgs, updatedAt: Date.now() };
}
