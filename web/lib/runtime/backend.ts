// ── 通用任务执行引擎（Browser Backend Layer）──
// 不依赖 React，不知晓 Chat 领域。
// 事件驱动架构：emit(event) → UI 响应事件 → 增量 merge。

import { type Session, saveSessions } from "@/lib/config";

export type TaskStatus = "running" | "done" | "error" | "aborted";

export type TaskState = {
  id: string;
  sessionId: string;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  abortController?: AbortController;
};

export type BackendEvent =
  | { type: "task_update"; payload: TaskState }
  | { type: "session_update"; payload: Session };

const taskStore = new Map<string, TaskState>();
const sessionStore = new Map<string, Session>();
const listeners = new Set<(event: BackendEvent) => void>();

function emit(event: BackendEvent): void {
  listeners.forEach((fn) => fn(event));
}

// ── Snapshot（仅用于 init/debug，不用于 UI 驱动）──

export type BackendSnapshot = {
  sessions: Session[];
  tasks: TaskState[];
  tasksBySession: Record<string, TaskState[]>;
};

export function getSnapshot(): BackendSnapshot {
  const tasks = Array.from(taskStore.values());
  const tasksBySession: Record<string, TaskState[]> = {};
  for (const t of tasks) {
    if (!tasksBySession[t.sessionId]) tasksBySession[t.sessionId] = [];
    tasksBySession[t.sessionId].push(t);
  }
  return {
    sessions: Array.from(sessionStore.values()),
    tasks,
    tasksBySession,
  };
}

// ── Session store 管理 ──

export function loadSessions(sessions: Session[]): void {
  sessionStore.clear();
  for (const s of sessions) {
    sessionStore.set(s.id, s);
  }
}

function persistSessions(): void {
  saveSessions(Array.from(sessionStore.values()));
}

// ── CRUD ──

export function getTask(id: string): TaskState | undefined {
  return taskStore.get(id);
}

export function getAllTasks(): TaskState[] {
  return Array.from(taskStore.values());
}

// ── 执行 ──

export function runTask(
  id: string,
  sessionId: string,
  fn: (signal: AbortSignal) => Promise<unknown>,
): void {
  const abortController = new AbortController();

  const task: TaskState = {
    id,
    sessionId,
    status: "running",
    abortController,
  };
  taskStore.set(id, task);
  emit({ type: "task_update", payload: task });

  fn(abortController.signal)
    .then((result) => {
      if (abortController.signal.aborted) return;

      taskStore.set(id, { id, sessionId, status: "done", result });

      // result 应为 Session，写入 sessionStore + localStorage
      if (result && typeof result === "object" && "id" in result) {
        const session = result as Session;
        sessionStore.set(session.id, session);
        persistSessions();
        emit({ type: "session_update", payload: session });
      }

      emit({
        type: "task_update",
        payload: { id, sessionId, status: "done", result },
      });
    })
    .catch((e) => {
      if (abortController.signal.aborted) return;

      const isAbort = e instanceof DOMException && e.name === "AbortError";
      const finalTask: TaskState = {
        id,
        sessionId,
        status: isAbort ? "aborted" : "error",
        error: isAbort ? undefined : (e instanceof Error ? e.message : "任务执行失败"),
      };
      taskStore.set(id, finalTask);
      emit({ type: "task_update", payload: finalTask });
    });
}

// ── 中断 ──

export function abortTask(id: string): void {
  const task = taskStore.get(id);
  if (!task || task.status !== "running") return;
  task.abortController?.abort();

  const abortedTask: TaskState = { ...task, status: "aborted", abortController: undefined };
  taskStore.set(id, abortedTask);
  emit({ type: "task_update", payload: abortedTask });
}

// ── 订阅 ──

export function subscribe(fn: (event: BackendEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
