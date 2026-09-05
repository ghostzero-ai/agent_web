// ── Agent Dispatcher ──
// 注册 domain handler 到 backend hook pipeline。
// 在 app init 时调用一次（idempotent）。

import {
  registerTaskCompleteHook,
  updateSession,
  type TaskState,
} from "@/lib/runtime/backend";
import { isSession } from "@/lib/config";
import { getActiveMessages } from "@/lib/conversation/tree";
import { compress, COMPRESSION_THRESHOLD } from "./contextCompressor";
import { addMemory } from "./memory";

let initialized = false;

export function initAgentDispatcher(): void {
  if (initialized) return;
  initialized = true;

  registerTaskCompleteHook("chat_completion", (_task: TaskState, result: unknown) => {
    if (!isSession(result)) return;

    const session = result;
    updateSession(session);
    const activeMessages = getActiveMessages(session);
    if (activeMessages.length < COMPRESSION_THRESHOLD) return;

    const { memoryItems } = compress(activeMessages);
    for (const item of memoryItems) {
      addMemory(item);
    }
  });
}
