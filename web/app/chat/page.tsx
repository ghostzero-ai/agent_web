"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  validateConfig,
  getSessions,
  saveSessions,
  migrateOnce,
  type ChatMessage,
  type Session,
} from "@/lib/config";
import { executeSend, executeRetry } from "@/lib/ai/chatService";
import { runTask, subscribe, getAllTasks } from "@/lib/runtime/backend";

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 初始化 ──
  useEffect(() => {
    const loaded = migrateOnce();
    setSessions(loaded);
    if (loaded.length > 0) {
      setActiveSessionId(loaded[0].id);
    }
  }, []);

  // ── 订阅 Backend ──
  useEffect(() => {
    return subscribe(() => {
      setSessions(getSessions());
      setLoading(getAllTasks().some((t) => t.status === "running"));
    });
  }, []);

  // ── 持久化 ──
  useEffect(() => {
    if (sessions.length > 0) {
      saveSessions(sessions);
    }
  }, [sessions]);

  // ── 派生值 ──
  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId) ?? null
    : null;

  const messages: ChatMessage[] = activeSession?.messages ?? [];

  // ── 新建 Session ──
  const handleNewSession = () => {
    const newSession: Session = {
      id: crypto.randomUUID(),
      title: "新对话",
      messages: [],
      updatedAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  // ── 删除 Session ──
  const handleDeleteSession = (id: string) => {
    if (!window.confirm("确定要删除这个对话吗？")) return;
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (id === activeSessionId) {
        setActiveSessionId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  // ── 发送消息（dispatch to Backend）──
  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const config = validateConfig();
    if (!config.valid) {
      setError("请先配置 API Key、Base URL 和 Model 才能使用 Chat 功能");
      return;
    }

    if (!activeSessionId) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };

    const shouldUpdateTitle = messages.length === 0;

    const updatedMessages = [...messages, userMessage];
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              messages: updatedMessages,
              title: shouldUpdateTitle ? trimmed.slice(0, 20) : s.title,
              updatedAt: Date.now(),
            }
          : s,
      ),
    );

    setInput("");
    setError(null);

    const taskId = crypto.randomUUID();
    runTask(taskId, () => executeSend(activeSessionId, updatedMessages));
  };

  // ── Retry（dispatch to Backend）──
  const handleRetry = (msgIndex: number) => {
    if (loading) return;
    if (!activeSessionId) return;

    const msg = messages[msgIndex];
    if (!msg || msg.role !== "assistant") return;

    if (!window.confirm("确定要重新生成回复吗？")) return;

    let lastUserIdx = -1;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;

    const messagesToSend = messages.slice(0, lastUserIdx + 1);

    setError(null);

    const taskId = crypto.randomUUID();
    runTask(taskId, () =>
      executeRetry(activeSessionId, messagesToSend, msgIndex),
    );
  };

  // ── 版本切换（纯 UI 操作，不经过 Backend）──
  const handleSwitchVersion = (
    msgIndex: number,
    direction: "prev" | "next",
  ) => {
    if (!activeSessionId) return;

    const msg = messages[msgIndex];
    if (!msg || !msg.versions || msg.versions.length <= 1) return;

    const currentVersion = msg.activeVersion ?? msg.versions.length - 1;
    const newVersion =
      direction === "next"
        ? Math.min(currentVersion + 1, msg.versions.length - 1)
        : Math.max(currentVersion - 1, 0);

    if (newVersion === currentVersion) return;

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const msgs = [...s.messages];
        msgs[msgIndex] = {
          ...msgs[msgIndex],
          content: msg.versions![newVersion],
          activeVersion: newVersion,
        };
        return { ...s, messages: msgs, updatedAt: Date.now() };
      }),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      sendMessage();
    }
  };

  // ── 格式化 ──
  const formatSessionTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const formatMsgTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* Top header bar */}
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <h1 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          AI 对话
        </h1>
        <Link
          href="/api-key"
          className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          API 配置
        </Link>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
          <p className="flex-1 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
          <Link
            href="/api-key"
            className="text-sm font-medium text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
          >
            前往配置
          </Link>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-sm font-medium text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
          >
            关闭
          </button>
        </div>
      )}

      {/* Main: Sidebar + Chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── 左侧 Session 列表 ── */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={handleNewSession}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              + 新建对话
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {sessions.length === 0 ? (
              <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
                暂无对话，点击上方按钮开始
              </p>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="group flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSessionId(session.id)}
                      className={`flex-1 rounded-lg px-3 py-2 text-left transition-colors ${
                        session.id === activeSessionId
                          ? "bg-zinc-200 dark:bg-zinc-800"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <p
                        className={`truncate text-sm ${
                          session.id === activeSessionId
                            ? "font-medium text-zinc-900 dark:text-zinc-100"
                            : "text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {session.title}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        {formatSessionTime(session.updatedAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      className="shrink-0 rounded px-1.5 py-1 text-xs text-zinc-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 dark:text-zinc-500 dark:hover:text-red-400"
                      title="删除对话"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── 右侧聊天区域 ── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
            {!activeSession ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2">
                <h2 className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
                  开始你的第一段对话
                </h2>
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  点击左侧「新建对话」开始
                </p>
              </div>
            ) : messages.length === 0 && !loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2">
                <h2 className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
                  开始你的第一段对话
                </h2>
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  输入问题，AI 将为你提供帮助
                </p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-2xl space-y-6">
                {messages.map((msg, i) => {
                  const hasVersions =
                    msg.role === "assistant" &&
                    msg.versions &&
                    msg.versions.length > 1;
                  const versionCount = msg.versions?.length ?? 0;
                  const activeVersion =
                    msg.activeVersion ?? versionCount - 1;

                  return (
                    <div
                      key={msg.id ?? i}
                      className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === "user"
                            ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black"
                            : "border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                        }`}
                      >
                        {msg.content}
                      </div>

                      {/* Timestamp + Actions */}
                      <div
                        className={`mt-1 flex items-center gap-2 flex-wrap ${
                          msg.role === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        {msg.createdAt && (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                            {formatMsgTime(msg.createdAt)}
                          </span>
                        )}

                        {hasVersions && (
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                            <button
                              type="button"
                              onClick={() => handleSwitchVersion(i, "prev")}
                              disabled={activeVersion === 0}
                              className="disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                              ◀
                            </button>
                            <span>
                              {activeVersion + 1}/{versionCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSwitchVersion(i, "next")}
                              disabled={activeVersion === versionCount - 1}
                              className="disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                              ▶
                            </button>
                          </span>
                        )}

                        {msg.role === "assistant" && !loading && (
                          <button
                            type="button"
                            onClick={() => handleRetry(i)}
                            className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                          >
                            重新生成
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                      AI 思考中...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input area */}
          {activeSessionId && (
            <footer className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="mx-auto flex max-w-2xl gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="请输入你的问题"
                  disabled={loading}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={loading}
                  className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
                >
                  发送
                </button>
              </div>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}
