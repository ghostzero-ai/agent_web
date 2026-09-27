// ── 上下文压缩器 ──
// 仅生成会话摘要；长期记忆必须走服务端 MemoryCandidate 确认流程。
// 不调用 AI（避免循环依赖）。

import { type ChatMessage } from "@/lib/config";
import { type MemoryItem } from "./memory";

export const COMPRESSION_THRESHOLD = 20;

type CompressionResult = {
  summary: string;
  memoryItems: MemoryItem[];
};

export function compress(messages: ChatMessage[]): CompressionResult {
  if (messages.length < COMPRESSION_THRESHOLD) {
    return { summary: "", memoryItems: [] };
  }

  // 提取关键消息：首 3 条 + 尾 5 条
  const head = messages.slice(0, 3);
  const tail = messages.slice(-5);
  const keyMessages = [...head, ...tail];

  // 生成摘要
  const summaryParts = keyMessages.map(
    (m) => `[${m.role === "user" ? "用户" : "AI"}]: ${m.content.slice(0, 100)}`,
  );
  const summary = summaryParts.join(" | ");

  return { summary, memoryItems: [] };
}
