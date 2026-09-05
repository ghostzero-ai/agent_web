"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatErrorBanner } from "@/components/chat/ChatErrorBanner";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import {
  validateConfig,
  migrateOnce,
  type ChatMessage,
  type Session,
} from "@/lib/config";
import { sendChatMessage, applySendReply, applyRetryReply } from "@/lib/ai/chatService";
import {
  runTask,
  abortTask,
  subscribe,
  loadSessions,
  createSession,
  updateSession,
  deleteSession,
  getSessionsSnapshot,
  getServerSessionsSnapshot,
  subscribeSessions,
  type TaskState,
  type BackendEvent,
} from "@/lib/runtime/backend";
import { buildAgentPrompt } from "@/lib/agent/promptBuilder";
import { getMemory } from "@/lib/agent/memory";
import { initAgentDispatcher } from "@/lib/agent/dispatcher";
import {
  appendMessage,
  checkoutSessionAt,
  getActiveMessages,
  normalizeSessionTree,
  switchAssistantVersion,
} from "@/lib/conversation/tree";

// ── 初始化 Agent Dispatcher（idempotent，注册 domain hook）──
initAgentDispatcher();

function currentTimestamp(): number {
  return Date.now();
}

export default function ChatPage() {
  const sessions = useSyncExternalStore(
    subscribeSessions,
    getSessionsSnapshot,
    getServerSessionsSnapshot,
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Record<string, TaskState>>({});

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ── 初始化 ──
  useEffect(() => {
    const loaded = migrateOnce();
    loadSessions(loaded);
  }, []);

  // ── 订阅 Backend 事件（纯 UI，不执行 domain logic）──
  useEffect(() => {
    return subscribe((event: BackendEvent) => {
      if (event.type === "task_update") {
        setTasks((prev) => ({ ...prev, [event.payload.id]: event.payload }));
      }
    });
  }, []);

  // ── 派生值 ──
  const resolvedActiveSessionId =
    activeSessionId && sessions.some((session) => session.id === activeSessionId)
      ? activeSessionId
      : sessions[0]?.id ?? null;

  const activeSession = resolvedActiveSessionId
    ? sessions.find((s) => s.id === resolvedActiveSessionId) ?? null
    : null;

  const messages: ChatMessage[] = activeSession
    ? getActiveMessages(activeSession)
    : [];

  const loading = Object.values(tasks).some(
    (t) => t.status === "running" && t.sessionId === resolvedActiveSessionId,
  );

  const runningTaskId = Object.values(tasks).find(
    (t) => t.status === "running" && t.sessionId === resolvedActiveSessionId,
  )?.id ?? null;

  // ── 新建 Session ──
  const handleNewSession = () => {
    const newSession: Session = {
      id: crypto.randomUUID(),
      title: "新对话",
      messages: [],
      updatedAt: currentTimestamp(),
    };
    createSession(normalizeSessionTree(newSession));
    setActiveSessionId(newSession.id);
  };

  // ── 删除 Session ──
  const handleDeleteSession = (id: string) => {
    if (!window.confirm("确定要删除这个对话吗？")) return;
    const remaining = deleteSession(id);
    if (id === resolvedActiveSessionId) {
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // ── 发送消息 ──
  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const config = validateConfig();
    if (!config.valid) {
      setError("请先配置 API Key、Base URL 和 Model 才能使用 Chat 功能");
      return;
    }

    if (!resolvedActiveSessionId || !activeSession) return;

    const timestamp = currentTimestamp();

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: timestamp,
    };

    const shouldUpdateTitle = messages.length === 0;

    const optimisticSession: Session = {
      ...appendMessage(activeSession, userMessage),
      title: shouldUpdateTitle ? trimmed.slice(0, 20) : activeSession.title,
      updatedAt: timestamp,
    };
    updateSession(optimisticSession);

    setInput("");
    setError(null);

    const taskId = crypto.randomUUID();

    runTask(taskId, resolvedActiveSessionId, async (signal) => {
      const memory = getMemory();
      const agentContext = buildAgentPrompt({ session: optimisticSession, memory });
      const reply = await sendChatMessage(agentContext, signal);
      return applySendReply(optimisticSession, reply);
    }, "chat_completion");
  };

  // ── Retry ──
  const handleRetry = (messageId: string) => {
    if (loading) return;
    if (!resolvedActiveSessionId || !activeSession) return;

    const msg = messages.find((message) => message.id === messageId);
    if (!msg || msg.role !== "assistant") return;

    if (!window.confirm("确定要重新生成回复吗？")) return;

    // 从目标回答的父节点重新生成；原回答及其后续仍保留在旧分支。
    const retrySession = checkoutSessionAt(
      activeSession,
      msg.parentId ?? null,
    );

    setError(null);

    const taskId = crypto.randomUUID();

    runTask(taskId, resolvedActiveSessionId, async (signal) => {
      const memory = getMemory();
      const agentContext = buildAgentPrompt({ session: retrySession, memory });
      const reply = await sendChatMessage(agentContext, signal);
      return applyRetryReply(activeSession, reply, messageId);
    }, "chat_completion");
  };

  // ── 停止生成 ──
  const handleStop = () => {
    if (runningTaskId) {
      abortTask(runningTaskId);
    }
  };

  // ── 版本切换 ──
  const handleSwitchVersion = (
    messageId: string,
    direction: "prev" | "next",
  ) => {
    if (!resolvedActiveSessionId || !activeSession) return;
    const switched = switchAssistantVersion(
      activeSession,
      messageId,
      direction,
    );
    if (switched.activeLeafId === activeSession.activeLeafId) return;
    updateSession({
      ...switched,
      updatedAt: currentTimestamp(),
    });
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
      <ChatHeader />

      {error && (
        <ChatErrorBanner message={error} onDismiss={() => setError(null)} />
      )}

      <div className="flex flex-1 overflow-hidden">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={resolvedActiveSessionId}
          onCreate={handleNewSession}
          onSelect={setActiveSessionId}
          onDelete={handleDeleteSession}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
            <MessageList
              hasActiveSession={Boolean(activeSession)}
              messages={messages}
              allMessages={activeSession?.messages ?? []}
              loading={loading}
              onRetry={handleRetry}
              onSwitchVersion={handleSwitchVersion}
            />
          </div>

          {resolvedActiveSessionId && (
            <ChatComposer
              value={input}
              loading={loading}
              onChange={setInput}
              onSend={sendMessage}
              onStop={handleStop}
            />
          )}
        </main>
      </div>
    </div>
  );
}
