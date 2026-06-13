"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "agent_api_key";

export default function ApiKeyPage() {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSavedKey(stored);
      setApiKey(stored);
    }
  }, []);

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setSavedKey(trimmed);
  };

  const handleDelete = () => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey("");
    setSavedKey(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <h1 className="text-3xl font-bold text-zinc-950 dark:text-zinc-50 sm:text-4xl">
          API 密钥管理
        </h1>

        <div className="mt-10 w-full max-w-md space-y-6">
          {/* Input */}
          <div>
            <label
              htmlFor="api-key-input"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              API Key
            </label>
            <input
              id="api-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="请输入你的 API Key"
              className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
            >
              保存密钥
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              删除密钥
            </button>
          </div>

          {/* Status */}
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
            {savedKey ? (
              <p className="text-sm text-green-700 dark:text-green-400">
                当前已保存 API Key
              </p>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                尚未设置 API Key
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
