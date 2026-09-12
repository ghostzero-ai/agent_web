import Link from "next/link";
import { InboxManager } from "@/components/inbox/InboxManager";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">收件箱</h1>
          <p className="hidden text-xs text-zinc-500 sm:block">由后台 Worker 持久保存的任务提醒</p>
        </div>
        <nav className="flex shrink-0 gap-3 text-xs font-medium text-zinc-500 sm:gap-4 sm:text-sm">
          <Link href="/notifications" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">通知</Link>
          <Link href="/chat" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">对话</Link>
          <Link href="/tasks" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">任务</Link>
          <Link href="/api-key" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">API</Link>
        </nav>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-10">
        <InboxManager />
      </main>
    </div>
  );
}
