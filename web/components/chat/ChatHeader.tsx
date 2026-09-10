import Link from "next/link";

type ChatHeaderProps = {
  onOpenSidebar?: () => void;
  sidebarOpen?: boolean;
};

export function ChatHeader({
  onOpenSidebar,
  sidebarOpen = false,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-3 py-3 sm:px-6 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
            aria-label="打开对话列表"
            aria-controls="mobile-session-drawer"
            aria-expanded={sidebarOpen}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <h1 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          AI 对话
        </h1>
      </div>
      <nav className="flex items-center gap-2 text-xs font-medium text-zinc-500 sm:gap-4 dark:text-zinc-400">
        <Link
          href="/inbox"
          className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          收件箱
        </Link>
        <Link
          href="/tasks"
          className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          任务
        </Link>
        <Link
          href="/api-key"
          className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          API 配置
        </Link>
      </nav>
    </header>
  );
}
