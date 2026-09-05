// ── 上下文压缩器 ──
// 启发式提取关键信息，生成摘要 + 记忆条目。
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

  // 提取用户问题作为 memory fact
  const memoryItems: MemoryItem[] = [];
  const userMessages = messages.filter((m) => m.role === "user");

  for (const msg of userMessages.slice(-10)) {
    const content = msg.content.trim();
    if (content.length < 5) continue;
    memoryItems.push({
      id: crypto.randomUUID(),
      type: "fact",
      content: content.slice(0, 200),
      importance: Math.min(10, Math.ceil(content.length / 50)),
      createdAt: Date.now(),
    });
  }

  // 生成摘要
  const summaryParts = keyMessages.map(
    (m) => `[${m.role === "user" ? "用户" : "AI"}]: ${m.content.slice(0, 100)}`,
  );
  const summary = summaryParts.join(" | ");

  // 去重
  const seen = new Set<string>();
  const uniqueItems = memoryItems.filter((item) => {
    const key = `${item.type}:${item.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { summary, memoryItems: uniqueItems };
}
