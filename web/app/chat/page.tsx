"use client";

import { useState } from "react";
import Link from "next/link";
import { getApiKey, getApiBaseUrl, getApiModel, validateConfig } from "@/lib/config";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // Validate config
    const config = validateConfig();
    if (!config.valid) {
      setError("请先配置 API Key、Base URL 和 Model 才能使用 Chat 功能");
      return;
    }

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const apiKey = getApiKey()!;
      const baseUrl = getApiBaseUrl()!.replace(/\/+$/, "");
      const model = getApiModel()!;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: trimmed }],
        }),
      });

      if (!response.ok) {
        throw new Error(`API 返回错误：${response.status}`);
      }

      const data = await response.json();
      const content =
        data.choices?.[0]?.message?.content || "（AI 未返回内容）";

      const assistantMessage: Message = { role: "assistant", content };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "API 调用失败，请检查网络连接";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      sendMessage();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          AI 对话
        </h1>
        <Link
          href="/api-key"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          API 配置
        </Link>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
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

      {/* Message List */}
      <main className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              开始对话吧
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black"
                      : "border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  AI 思考中...
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Input Area */}
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
    </div>
  );
}
