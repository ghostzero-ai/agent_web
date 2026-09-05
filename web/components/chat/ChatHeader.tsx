import Link from "next/link";

export function ChatHeader() {
  return (
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
  );
}
