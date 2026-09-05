// ── 通用任务执行引擎（Browser Backend Layer）──
// 不依赖 React，不知晓 Chat 领域。
// 事件驱动架构 + 按 taskType 分类的 hook registry。

import { type Session, saveSessions } from "@/lib/config";
import { normalizeSessionTree } from "@/lib/conversation/tree";

export type TaskStatus = "running" | "done" | "error" | "aborted";

export type TaskState = {
  id: string;
  sessionId: string;
  status: TaskStatus;
  taskType?: string;
  result?: unknown;
  error?: string;
  abortController?: AbortController;
};

export type BackendEvent =
  | { type: "task_update"; payload: TaskState }
  | { type: "sessions_update"; payload: Session[] };

const taskStore = new Map<string, TaskState>();
const sessionStore = new Map<string, Session>();
const listeners = new Set<(event: BackendEvent) => void>();
const sessionListeners = new Set<() => void>();
const emptySessionSnapshot: Session[] = [];
let sessionSnapshot: Session[] = emptySessionSnapshot;

function emit(event: BackendEvent): void {
  listeners.forEach((fn) => fn(event));
}

// ── Hook registry（按 taskType 分类）──

type TaskCompleteHook = (task: TaskState, result: unknown) => void;
const taskCompleteHooks = new Map<string, TaskCompleteHook[]>();

export function registerTaskCompleteHook(
  taskType: string,
  fn: TaskCompleteHook,
): () => void {
  const hooks = taskCompleteHooks.get(taskType) ?? [];
  hooks.push(fn);
  taskCompleteHooks.set(taskType, hooks);
  return () => {
    const idx = hooks.indexOf(fn);
    if (idx !== -1) hooks.splice(idx, 1);
  };
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
    sessions: sessionSnapshot,
    tasks,
    tasksBySession,
  };
}

// ── Session store 管理 ──

export function loadSessions(sessions: Session[]): void {
  sessionStore.clear();
  for (const s of sessions) {
    const normalized = normalizeSessionTree(s);
    sessionStore.set(normalized.id, normalized);
  }
  sessionSnapshot = Array.from(sessionStore.values());
  sessionListeners.forEach((listener) => listener());
}

function publishSessions(): Session[] {
  sessionSnapshot = Array.from(sessionStore.values());
  saveSessions(sessionSnapshot);
  sessionListeners.forEach((listener) => listener());
  emit({ type: "sessions_update", payload: sessionSnapshot });
  return sessionSnapshot;
}

export function getSessionsSnapshot(): Session[] {
  return sessionSnapshot;
}

export function getServerSessionsSnapshot(): Session[] {
  return emptySessionSnapshot;
}

export function subscribeSessions(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

// ── CRUD ──

export function createSession(session: Session): Session[] {
  const normalized = normalizeSessionTree(session);
  // 新会话保持在列表首位；更新已有 id 时也只保留一份。
  const previous = Array.from(sessionStore.values()).filter(
    (item) => item.id !== normalized.id,
  );
  sessionStore.clear();
  sessionStore.set(normalized.id, normalized);
  for (const item of previous) {
    sessionStore.set(item.id, item);
  }
  return publishSessions();
}

export function updateSession(session: Session): Session[] {
  const normalized = normalizeSessionTree(session);
  // 异步任务不得重新创建已经被用户删除的会话。
  if (!sessionStore.has(normalized.id)) {
    return sessionSnapshot;
  }
  sessionStore.set(normalized.id, normalized);
  return publishSessions();
}

export function deleteSession(id: string): Session[] {
  for (const task of taskStore.values()) {
    if (task.sessionId === id && task.status === "running") {
      abortTask(task.id);
    }
  }

  if (!sessionStore.delete(id)) {
    return sessionSnapshot;
  }
  return publishSessions();
}

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
  taskType?: string,
): void {
  const abortController = new AbortController();

  const task: TaskState = {
    id,
    sessionId,
    status: "running",
    taskType,
    abortController,
  };
  taskStore.set(id, task);
  emit({ type: "task_update", payload: task });

  fn(abortController.signal)
    .then((result) => {
      if (abortController.signal.aborted) return;

      taskStore.set(id, { id, sessionId, status: "done", result, taskType });

      const doneTask: TaskState = { id, sessionId, status: "done", result, taskType };
      emit({ type: "task_update", payload: doneTask });

      // 触发 domain hooks（按 taskType 分类）
      if (taskType) {
        const hooks = taskCompleteHooks.get(taskType) ?? [];
        for (const hook of hooks) {
          hook(doneTask, result);
        }
      }
    })
    .catch((e) => {
      if (abortController.signal.aborted) return;

      const isAbort = e instanceof DOMException && e.name === "AbortError";
      const finalTask: TaskState = {
        id,
        sessionId,
        status: isAbort ? "aborted" : "error",
        taskType,
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
