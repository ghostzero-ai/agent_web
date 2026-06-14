// ── 通用任务执行引擎（Browser Backend Layer）──
// 不依赖 React，不知晓 Chat 领域（sessions/messages/localStorage）
// 只做：接受任务 → 执行 → 追踪状态 → 通知订阅者

export type TaskStatus = "running" | "done" | "error";

export type TaskState = {
  id: string;
  status: TaskStatus;
  result?: unknown;
  error?: string;
};

const taskStore = new Map<string, TaskState>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

// ── CRUD ──

export function getTask(id: string): TaskState | undefined {
  return taskStore.get(id);
}

export function getAllTasks(): TaskState[] {
  return Array.from(taskStore.values());
}

// ── 执行（fire-and-forget，不 await）──

export function runTask(id: string, fn: () => Promise<unknown>): void {
  taskStore.set(id, { id, status: "running" });
  notify();

  fn()
    .then((result) => {
      taskStore.set(id, { id, status: "done", result });
      notify();
    })
    .catch((e) => {
      taskStore.set(id, {
        id,
        status: "error",
        error: e instanceof Error ? e.message : "任务执行失败",
      });
      notify();
    });
}

// ── 订阅系统 ──

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
