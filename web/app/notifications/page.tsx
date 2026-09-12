import Link from "next/link";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">通知设置</h1>
          <p className="hidden text-xs text-zinc-500 sm:block">设备订阅、Push 开关与安静时段</p>
        </div>
        <nav className="flex shrink-0 gap-3 text-xs font-medium text-zinc-500 sm:gap-4 sm:text-sm">
          <Link href="/inbox" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">收件箱</Link>
          <Link href="/tasks" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">任务</Link>
          <Link href="/chat" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">对话</Link>
        </nav>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-10">
        <NotificationSettings />
      </main>
    </div>
  );
}
