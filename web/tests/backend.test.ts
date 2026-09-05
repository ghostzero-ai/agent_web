import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "../lib/config";
import {
  installBrowserStorage,
  uninstallBrowserStorage,
} from "./helpers/browserStorage";

const session: Session = {
  id: "session-1",
  title: "测试会话",
  schemaVersion: 2,
  activeLeafId: null,
  messages: [],
  updatedAt: 1,
};

async function flushTaskQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  installBrowserStorage();
});

afterEach(() => {
  uninstallBrowserStorage();
});

describe("browser backend session store", () => {
  it("persists complete snapshots, including the empty state", async () => {
    const backend = await import("../lib/runtime/backend");
    backend.loadSessions([]);

    backend.createSession(session);
    expect(JSON.parse(localStorage.getItem("agent_chat_sessions")!)).toEqual([
      session,
    ]);

    const remaining = backend.deleteSession(session.id);
    expect(remaining).toEqual([]);
    expect(localStorage.getItem("agent_chat_sessions")).toBe("[]");
  });

  it("does not resurrect a deleted session when an async task finishes", async () => {
    const backend = await import("../lib/runtime/backend");
    backend.loadSessions([]);
    backend.createSession(session);

    let finishTask!: (value: Session) => void;
    const taskResult = new Promise<Session>((resolve) => {
      finishTask = resolve;
    });

    backend.runTask("task-1", session.id, () => taskResult, "chat_completion");
    backend.deleteSession(session.id);

    finishTask({
      ...session,
      activeLeafId: "late-message",
      messages: [
        {
          id: "late-message",
          parentId: null,
          role: "assistant",
          content: "迟到的回复",
        },
      ],
      updatedAt: 2,
    });
    await taskResult;
    await Promise.resolve();

    expect(backend.getSnapshot().sessions).toEqual([]);
    expect(backend.getTask("task-1")?.status).toBe("aborted");
    expect(localStorage.getItem("agent_chat_sessions")).toBe("[]");
  });
});

describe("browser backend task lifecycle", () => {
  it("emits running and done states and invokes the matching hook", async () => {
    const backend = await import("../lib/runtime/backend");
    const events: string[] = [];
    const hook = vi.fn();
    const unsubscribeEvents = backend.subscribe((event) => {
      if (event.type === "task_update") events.push(event.payload.status);
    });
    const unregisterHook = backend.registerTaskCompleteHook("test", hook);

    backend.runTask("task-1", "session-1", async () => "result", "test");
    await flushTaskQueue();

    expect(backend.getTask("task-1")).toMatchObject({
      status: "done",
      result: "result",
      taskType: "test",
    });
    expect(events).toEqual(["running", "done"]);
    expect(hook).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", status: "done" }),
      "result",
    );

    unregisterHook();
    unsubscribeEvents();
  });

  it("records task failures without invoking completion hooks", async () => {
    const backend = await import("../lib/runtime/backend");
    const hook = vi.fn();
    backend.registerTaskCompleteHook("test", hook);

    backend.runTask(
      "task-failed",
      "session-1",
      async () => {
        throw new Error("boom");
      },
      "test",
    );
    await flushTaskQueue();

    expect(backend.getTask("task-failed")).toMatchObject({
      status: "error",
      error: "boom",
    });
    expect(hook).not.toHaveBeenCalled();
  });

  it("aborts a running task and publishes the aborted state", async () => {
    const backend = await import("../lib/runtime/backend");
    const statuses: string[] = [];
    backend.subscribe((event) => {
      if (event.type === "task_update") statuses.push(event.payload.status);
    });

    backend.runTask(
      "task-aborted",
      "session-1",
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    backend.abortTask("task-aborted");
    await flushTaskQueue();

    expect(backend.getTask("task-aborted")?.status).toBe("aborted");
    expect(statuses).toEqual(["running", "aborted"]);
  });

  it("does not treat arbitrary objects with ids as sessions", async () => {
    const backend = await import("../lib/runtime/backend");
    backend.loadSessions([]);
    backend.createSession(session);

    backend.runTask("generic", session.id, async () => ({
      id: session.id,
      payload: "not-a-session",
    }));
    await flushTaskQueue();

    expect(backend.getSessionsSnapshot()).toEqual([session]);
  });

  it("lets the agent dispatcher persist only validated chat results", async () => {
    const backend = await import("../lib/runtime/backend");
    const { initAgentDispatcher } = await import("../lib/agent/dispatcher");
    backend.loadSessions([]);
    backend.createSession(session);
    initAgentDispatcher();

    const completed: Session = {
      ...session,
      activeLeafId: "completed-message",
      messages: [
        {
          id: "completed-message",
          parentId: null,
          role: "assistant",
          content: "完成",
        },
      ],
      updatedAt: 2,
    };
    backend.runTask(
      "chat-task",
      session.id,
      async () => completed,
      "chat_completion",
    );
    await flushTaskQueue();

    expect(backend.getSessionsSnapshot()).toEqual([completed]);
  });
});
