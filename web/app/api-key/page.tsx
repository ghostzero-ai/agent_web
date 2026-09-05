"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEYS = {
  apiKey: "agent_api_key",
  baseUrl: "agent_api_base_url",
  model: "agent_api_model",
};

type StoredConfig = {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
};

function subscribeToHydration(): () => void {
  return () => undefined;
}

function getClientHydrationSnapshot(): boolean {
  return true;
}

function getServerHydrationSnapshot(): boolean {
  return false;
}

function readStoredConfig(): StoredConfig {
  return {
    apiKey: localStorage.getItem(STORAGE_KEYS.apiKey),
    baseUrl: localStorage.getItem(STORAGE_KEYS.baseUrl),
    model: localStorage.getItem(STORAGE_KEYS.model),
  };
}

function ApiKeyForm({ initialConfig }: { initialConfig: StoredConfig }) {
  const [apiKey, setApiKey] = useState(initialConfig.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl ?? "");
  const [model, setModel] = useState(initialConfig.model ?? "");
  const [saved, setSaved] = useState<{
    apiKey: string | null;
    baseUrl: string | null;
    model: string | null;
  }>(initialConfig);

  const handleSave = () => {
    const trimmedKey = apiKey.trim();
    const trimmedUrl = baseUrl.trim();
    const trimmedModel = model.trim();

    if (!trimmedKey && !trimmedUrl && !trimmedModel) return;

    if (trimmedKey) {
      localStorage.setItem(STORAGE_KEYS.apiKey, trimmedKey);
    }
    if (trimmedUrl) {
      localStorage.setItem(STORAGE_KEYS.baseUrl, trimmedUrl);
    }
    if (trimmedModel) {
      localStorage.setItem(STORAGE_KEYS.model, trimmedModel);
    }

    setSaved({
      apiKey: trimmedKey || saved.apiKey,
      baseUrl: trimmedUrl || saved.baseUrl,
      model: trimmedModel || saved.model,
    });
  };

  const handleDelete = () => {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    localStorage.removeItem(STORAGE_KEYS.baseUrl);
    localStorage.removeItem(STORAGE_KEYS.model);
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setSaved({ apiKey: null, baseUrl: null, model: null });
  };

  const isConfigured = saved.apiKey || saved.baseUrl || saved.model;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          API 配置管理
        </h1>
        <Link
          href="/chat"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          返回对话
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mt-10 w-full max-w-md space-y-6">
          {/* API Key */}
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

          {/* Base URL */}
          <div>
            <label
              htmlFor="base-url-input"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Base URL
            </label>
            <input
              id="base-url-input"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          {/* Model */}
          <div>
            <label
              htmlFor="model-input"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Model
            </label>
            <input
              id="model-input"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
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
              保存配置
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              删除配置
            </button>
          </div>

          {/* Status */}
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            {isConfigured ? (
              <>
                {saved.apiKey && (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    API Key 已配置
                  </p>
                )}
                {saved.baseUrl && (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Base URL 已配置
                  </p>
                )}
                {saved.model && (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Model 已配置
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                尚未配置
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ApiKeyPage() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  if (!hydrated) return null;

  return <ApiKeyForm initialConfig={readStoredConfig()} />;
}
