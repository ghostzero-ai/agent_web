// ── Agent Dispatcher ──
// 注册 domain handler 到 backend hook pipeline。
// 在 app init 时调用一次（idempotent）。

import {
  registerTaskCompleteHook,
  updateSession,
  type TaskState,
} from "@/lib/runtime/backend";
import { isSession } from "@/lib/config";

let initialized = false;

export function initAgentDispatcher(): void {
  if (initialized) return;
  initialized = true;

  registerTaskCompleteHook("chat_completion", (_task: TaskState, result: unknown) => {
    if (!isSession(result)) return;

    const session = result;
    updateSession(session);
    // Phase 5.1: completed chats must never write directly to long-term memory.
    // Server-side candidates are created separately and require user confirmation.
  });
}
