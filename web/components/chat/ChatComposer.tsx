import type { KeyboardEvent } from "react";

type ChatComposerProps = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatComposer({
  value,
  loading,
  onChange,
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
