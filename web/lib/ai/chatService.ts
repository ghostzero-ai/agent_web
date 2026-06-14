import {
  getApiKey,
  getApiBaseUrl,
  getApiModel,
  validateConfig,
  getSessions,
  saveSessions,
  type ChatMessage,
  type Session,
} from "@/lib/config";

/**
 * 发送消息到 AI API，返回 assistant 回复内容。
 * 纯函数，不依赖 React，不处理 UI state。
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
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
  });

  if (!response.ok) {
    throw new Error(`API 返回错误：${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "（AI 未返回内容）";
}

// ── 领域 Action（独立函数，不共享 mode 参数）──

/**
 * Send Action：调 API → localStorage 追加新 assistant → 返回 updatedSession
 */
export async function executeSend(
  sessionId: string,
  messages: ChatMessage[],
): Promise<Session> {
  const reply = await sendChatMessage(messages);

  const sessions = getSessions();
  let updatedSession: Session | null = null;

  const updated = sessions.map((s) => {
    if (s.id !== sessionId) return s;

    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: reply,
      createdAt: Date.now(),
      versions: [reply],
      activeVersion: 0,
    };
    updatedSession = {
      ...s,
      messages: [...s.messages, assistant],
      updatedAt: Date.now(),
    };
    return updatedSession;
  });

  saveSessions(updated);
  return updatedSession!;
}

/**
 * Retry Action：调 API → localStorage 更新指定 assistant 的 versions → 返回 updatedSession
 */
export async function executeRetry(
  sessionId: string,
  messages: ChatMessage[],
  targetMsgIndex: number,
): Promise<Session> {
  const reply = await sendChatMessage(messages);

  const sessions = getSessions();
  let updatedSession: Session | null = null;

  const updated = sessions.map((s) => {
    if (s.id !== sessionId) return s;

    const msgs = [...s.messages];
    const target = msgs[targetMsgIndex];
    if (!target || target.role !== "assistant") {
      updatedSession = s;
      return s;
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

    updatedSession = { ...s, messages: msgs, updatedAt: Date.now() };
    return updatedSession;
  });

  saveSessions(updated);
  return updatedSession!;
}
