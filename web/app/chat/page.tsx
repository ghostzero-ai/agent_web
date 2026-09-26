"use client";

import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatErrorBanner } from "@/components/chat/ChatErrorBanner";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ModeSelector } from "@/components/chat/ModeSelector";
import { PromptExportControl } from "@/components/chat/PromptExportControl";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import { getMemory } from "@/lib/agent/memory";
import type { CoreModeId } from "@/lib/agent/modeRegistry";
import { buildAgentPrompt } from "@/lib/agent/promptBuilder";
import { applyRetryReply, applySendReply, sendChatMessage } from "@/lib/ai/chatService";
import type { PromptRequestSnapshot } from "@/lib/ai/promptExport";
import {
  appendServerMessage,
  createServerSession,
  deleteServerSession,
  getServerSession,
  listServerSessions,
  renameServerSession,
  serverRecordToMessage,
  setServerActiveLeaf,
  type ServerSession,
  updateServerSession,
} from "@/lib/api/conversationClient";
import {
  clearLegacySessionsAfterImport,
  importLegacySessions,
  previewLegacySessions,
  type LegacyImportPreview,
} from "@/lib/api/legacyImportClient";
import {
  clearLegacyBrowserApiConfig,
  migrateOnce,
  type ChatMessage,
  type Session,
} from "@/lib/config";
import {
  appendMessage,
  checkoutSessionAt,
  getActiveMessages,
  switchAssistantVersion,
} from "@/lib/conversation/tree";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ServerSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const controllers = useRef(new Map<string, AbortController>());
  const [legacySessions, setLegacySessions] = useState<Session[]>([]);
  const [legacyPreview, setLegacyPreview] = useState<LegacyImportPreview | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const [input, setInput] = useState("");
  const [updatingModeSessionId, setUpdatingModeSessionId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [promptSnapshots, setPromptSnapshots] = useState<
    Record<string, PromptRequestSnapshot>
  >({});

  const capturePrompt = (
    session: Pick<Session, "id" | "title" | "activeLeafId">,
    prompt: PromptRequestSnapshot["prompt"],
    trigger: PromptRequestSnapshot["trigger"],
  ) => {
    const snapshot: PromptRequestSnapshot = {
      snapshotId: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      trigger,
      conversation: {
        id: session.id,
        title: session.title,
        activeLeafId: session.activeLeafId ?? null,
      },
      prompt: prompt.map((message) => ({ ...message })),
      modelRequest: null,
    };
    setPromptSnapshots((current) => ({
      ...current,
      [session.id]: snapshot,
    }));
    return snapshot;
  };

  const attachModelMetadata = (
    sessionId: string,
    snapshotId: string,
    modelRequest: NonNullable<PromptRequestSnapshot["modelRequest"]>,
  ) => {
    setPromptSnapshots((current) => {
      const snapshot = current[sessionId];
      if (!snapshot || snapshot.snapshotId !== snapshotId) return current;
      return {
        ...current,
        [sessionId]: { ...snapshot, modelRequest },
      };
    });
  };

  const replaceSession = (next: ServerSession) => {
    setSessions((current) =>
      current.map((session) => (session.id === next.id ? next : session)),
    );
  };

  const refreshSessions = async (preferredId?: string | null) => {
    const loaded = await listServerSessions();
    setSessions(loaded);
    setActiveSessionId((current) => {
      const candidate = preferredId ?? current;
      return candidate && loaded.some((session) => session.id === candidate)
        ? candidate
        : loaded[0]?.id ?? null;
    });
  };

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      clearLegacyBrowserApiConfig();
      const legacy = migrateOnce();
      if (!disposed) setLegacySessions(legacy);
      if (legacy.length > 0) {
        try {
          const preview = await previewLegacySessions(legacy);
          if (!disposed) setLegacyPreview(preview);
        } catch {
          if (!disposed) setLegacyPreview(null);
        }
      }
      try {
        await refreshSessions();
      } catch (loadError) {
        if (!disposed) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "无法读取服务端会话",
          );
        }
      }
    };
    void initialize();

    const activeControllers = controllers.current;
    return () => {
      disposed = true;
      for (const controller of activeControllers.values()) controller.abort();
      activeControllers.clear();
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sidebarOpen]);

  const resolvedActiveSessionId =
    activeSessionId && sessions.some((session) => session.id === activeSessionId)
      ? activeSessionId
      : sessions[0]?.id ?? null;
  const activeSession = resolvedActiveSessionId
    ? sessions.find((session) => session.id === resolvedActiveSessionId) ?? null
    : null;
  const messages: ChatMessage[] = activeSession
    ? getActiveMessages(activeSession)
    : [];
  const loading = resolvedActiveSessionId
    ? runningSessionIds.has(resolvedActiveSessionId)
    : false;

  const markRunning = (sessionId: string, controller: AbortController) => {
    controllers.current.set(sessionId, controller);
    setRunningSessionIds((current) => new Set(current).add(sessionId));
  };

  const markFinished = (sessionId: string) => {
    controllers.current.delete(sessionId);
    setRunningSessionIds((current) => {
      const next = new Set(current);
      next.delete(sessionId);
      return next;
    });
  };

  const handleNewSession = async () => {
    try {
      setError(null);
      const session = await createServerSession();
      setSessions((current) => [session, ...current]);
      setActiveSessionId(session.id);
      setSidebarOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "无法创建会话",
      );
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!window.confirm("确定要删除这个对话吗？")) return;
    try {
      controllers.current.get(id)?.abort();
      await deleteServerSession(id);
      setSessions((current) => current.filter((session) => session.id !== id));
      if (id === resolvedActiveSessionId) setActiveSessionId(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "无法删除会话",
      );
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !resolvedActiveSessionId || !activeSession) return;

    setInput("");
    setError(null);
    const sessionId = resolvedActiveSessionId;
    const controller = new AbortController();
    markRunning(sessionId, controller);

    let persistedUserSession = activeSession;
    try {
      const userResult = await appendServerMessage(sessionId, {
        parentMessageId: activeSession.activeLeafId ?? null,
        role: "user",
        content: trimmed,
      });
      const userMessage = serverRecordToMessage(userResult.message);
      persistedUserSession = {
        ...appendMessage(activeSession, userMessage),
        updatedAt: new Date(userResult.conversation.updatedAt).getTime(),
        serverVersion: userResult.conversation.version,
      };
      if (messages.length === 0) {
        const title = trimmed.slice(0, 20);
        const renamed = await renameServerSession(
          sessionId,
          title,
          persistedUserSession.serverVersion,
        );
        persistedUserSession = {
          ...persistedUserSession,
          title,
          updatedAt: new Date(renamed.updatedAt).getTime(),
          serverVersion: renamed.version,
        };
      }
      replaceSession(persistedUserSession);

      const prompt = buildAgentPrompt({
        session: persistedUserSession,
        memory: getMemory(),
      });
      const promptSnapshot = capturePrompt(persistedUserSession, prompt, "send");
      const provisionalId = crypto.randomUUID();
      const reply = await sendChatMessage(
        prompt,
        controller.signal,
        (_delta, accumulated) => {
          replaceSession(
            applySendReply(
              persistedUserSession,
              accumulated,
              provisionalId,
            ) as ServerSession,
          );
        },
        (metadata) =>
          attachModelMetadata(sessionId, promptSnapshot.snapshotId, metadata),
      );
      const assistantResult = await appendServerMessage(sessionId, {
        parentMessageId: userMessage.id ?? null,
        role: "assistant",
        content: reply,
      });
      replaceSession({
        ...appendMessage(
          persistedUserSession,
          serverRecordToMessage(assistantResult.message),
        ),
        updatedAt: new Date(assistantResult.conversation.updatedAt).getTime(),
        serverVersion: assistantResult.conversation.version,
      } as ServerSession);
    } catch (sendError) {
      replaceSession(persistedUserSession);
      if (!isAbortError(sendError) && !controller.signal.aborted) {
        setError(
          sendError instanceof Error ? sendError.message : "消息发送失败",
        );
      }
    } finally {
      markFinished(sessionId);
    }
  };

  const handleRetry = async (messageId: string) => {
    if (loading || !resolvedActiveSessionId || !activeSession) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    if (!message || message.role !== "assistant") return;
    if (!window.confirm("确定要重新生成回复吗？")) return;

    const sessionId = resolvedActiveSessionId;
    const retrySession = checkoutSessionAt(activeSession, message.parentId ?? null);
    const controller = new AbortController();
    const provisionalId = crypto.randomUUID();
    markRunning(sessionId, controller);
    setError(null);

    try {
      const prompt = buildAgentPrompt({ session: retrySession, memory: getMemory() });
      const promptSnapshot = capturePrompt(retrySession, prompt, "retry");
      const reply = await sendChatMessage(
        prompt,
        controller.signal,
        (_delta, accumulated) => {
          replaceSession(
            applyRetryReply(
              activeSession,
              accumulated,
              messageId,
              provisionalId,
            ) as ServerSession,
          );
        },
        (metadata) =>
          attachModelMetadata(sessionId, promptSnapshot.snapshotId, metadata),
      );
      await appendServerMessage(sessionId, {
        parentMessageId: message.parentId ?? null,
        role: "assistant",
        content: reply,
      });
      replaceSession(await getServerSession(sessionId));
    } catch (retryError) {
      replaceSession(activeSession);
      if (!isAbortError(retryError) && !controller.signal.aborted) {
        setError(
          retryError instanceof Error ? retryError.message : "重新生成失败",
        );
      }
    } finally {
      markFinished(sessionId);
    }
  };

  const handleSwitchVersion = async (
    messageId: string,
    direction: "prev" | "next",
  ) => {
    if (!activeSession || !resolvedActiveSessionId || loading) return;
    const switched = switchAssistantVersion(activeSession, messageId, direction);
    if (switched.activeLeafId === activeSession.activeLeafId) return;
    try {
      const updated = await setServerActiveLeaf(
        resolvedActiveSessionId,
        switched.activeLeafId ?? null,
        activeSession.serverVersion,
      );
      replaceSession({
        ...switched,
        updatedAt: new Date(updated.updatedAt).getTime(),
        serverVersion: updated.version,
      } as ServerSession);
    } catch (switchError) {
      setError(
        switchError instanceof Error ? switchError.message : "无法切换回答版本",
      );
      try {
        replaceSession(await getServerSession(resolvedActiveSessionId));
      } catch {
        // 保留原始错误，避免恢复请求覆盖更有用的诊断信息。
      }
    }
  };

  const handleModeChange = async (mode: CoreModeId) => {
    if (
      !activeSession ||
      !resolvedActiveSessionId ||
      loading ||
      updatingModeSessionId ||
      (activeSession.mode ?? "auto") === mode
    ) {
      return;
    }

    const sessionId = resolvedActiveSessionId;
    setUpdatingModeSessionId(sessionId);
    setError(null);
    try {
      const updated = await updateServerSession(sessionId, {
        mode,
        expectedVersion: activeSession.serverVersion,
      });
      replaceSession({
        ...activeSession,
        mode,
        updatedAt: new Date(updated.updatedAt).getTime(),
        serverVersion: updated.version,
      });
    } catch (modeError) {
      setError(
        modeError instanceof Error ? modeError.message : "无法更新对话模式",
      );
      try {
        replaceSession(await getServerSession(sessionId));
      } catch {
        // 保留模式更新的原始错误，避免恢复请求覆盖诊断信息。
      }
    } finally {
      setUpdatingModeSessionId((current) =>
        current === sessionId ? null : current,
      );
    }
  };

  const handleImport = async () => {
    if (legacySessions.length === 0 || importing) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importLegacySessions(legacySessions);
      clearLegacySessionsAfterImport();
      setLegacySessions([]);
      setLegacyPreview(null);
      await refreshSessions(result.conversationIds[0] ?? null);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "旧会话导入失败",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
      <ChatHeader
        onOpenSidebar={() => setSidebarOpen(true)}
        sidebarOpen={sidebarOpen}
        actions={
          <div className="flex items-center gap-2">
            <ModeSelector
              mode={activeSession?.mode ?? "auto"}
              disabled={
                !activeSession ||
                loading ||
                updatingModeSessionId === resolvedActiveSessionId
              }
              onChange={handleModeChange}
            />
            <PromptExportControl
              snapshot={
                resolvedActiveSessionId
                  ? promptSnapshots[resolvedActiveSessionId] ?? null
                  : null
              }
            />
          </div>
        }
      />

      {legacySessions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span>
            检测到 {legacySessions.length} 条浏览器旧会话
            {legacyPreview
              ? `（${legacyPreview.importable} 条可导入，${legacyPreview.alreadyImported} 条已导入）`
              : ""}
            ，是否导入服务端？
          </span>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="rounded bg-amber-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950"
          >
            {importing ? "正在导入…" : "确认导入"}
          </button>
          <button
            type="button"
            onClick={() => setLegacySessions([])}
            disabled={importing}
            className="text-xs underline underline-offset-2 disabled:opacity-50"
          >
            暂不导入
          </button>
        </div>
      )}

      {error && (
        <ChatErrorBanner message={error} onDismiss={() => setError(null)} />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden shrink-0 md:flex">
          <SessionSidebar
            sessions={sessions}
            activeSessionId={resolvedActiveSessionId}
            onCreate={handleNewSession}
            onSelect={setActiveSessionId}
            onDelete={handleDeleteSession}
          />
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
              onClick={() => setSidebarOpen(false)}
              aria-label="关闭对话列表遮罩"
            />
            <div
              id="mobile-session-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="对话列表"
              className="relative h-full w-[min(20rem,86vw)] shadow-2xl"
            >
              <SessionSidebar
                sessions={sessions}
                activeSessionId={resolvedActiveSessionId}
                onCreate={handleNewSession}
                onSelect={(id) => {
                  setActiveSessionId(id);
                  setSidebarOpen(false);
                }}
                onDelete={handleDeleteSession}
                mobile
                onClose={() => setSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
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
              onStop={() =>
                controllers.current.get(resolvedActiveSessionId)?.abort()
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
