import type { KeyboardEvent } from "react";
import type { SearchMode } from "@/lib/search/webSearch";

type ChatComposerProps = {
  value: string;
  loading: boolean;
  searchMode: SearchMode;
  onChange: (value: string) => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatComposer({
  value,
  loading,
  searchMode,
  onChange,
  onSearchModeChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !loading) {
      onSend();
    }
  };

  return (
    <footer className="border-t border-zinc-200 px-3 py-3 sm:px-6 sm:py-4 dark:border-zinc-800">
      <div className="mx-auto mb-2 flex max-w-2xl items-center gap-1" aria-label="联网搜索模式">
        {([
          ["auto", "自动"],
          ["on", "联网"],
          ["off", "关闭"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={loading}
            aria-pressed={searchMode === mode}
            onClick={() => onSearchModeChange(mode)}
            className={`rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
              searchMode === mode
                ? "bg-blue-600 text-white dark:bg-blue-500"
                : "bg-zinc-100 text-zinc-500 hover:text-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mx-auto flex max-w-2xl gap-2 sm:gap-3">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="请输入你的问题"
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-50 sm:px-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:px-5 dark:bg-red-700 dark:hover:bg-red-600"
          >
            停止生成
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 sm:px-5 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            发送
          </button>
        )}
      </div>
    </footer>
  );
}
