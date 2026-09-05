// ── 长期记忆系统（Browser Storage Layer）──
// 纯 localStorage 操作，不依赖 React / backend。

export type MemoryItem = {
  id: string;
  type: "fact" | "summary" | "user_preference";
  content: string;
  importance: number; // 1-10
  createdAt: number;
};

const STORAGE_KEY = "agent_memory_store";

function readStore(): MemoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MemoryItem[]) : [];
  } catch {
    return [];
  }
}

function writeStore(items: MemoryItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addMemory(item: MemoryItem): void {
  const items = readStore();
  // 去重：相同 type + content 不重复写入
  const exists = items.some(
    (m) => m.type === item.type && m.content === item.content,
  );
  if (exists) return;
  items.push(item);
  writeStore(items);
}

export function getMemory(): MemoryItem[] {
  return readStore().sort((a, b) => b.createdAt - a.createdAt);
}

export function clearMemory(): void {
  writeStore([]);
}

export function summarizeSession(title: string, content: string): MemoryItem {
  return {
    id: crypto.randomUUID(),
    type: "summary",
    content: `[${title}] ${content.slice(0, 200)}`,
    importance: 5,
    createdAt: Date.now(),
  };
}
