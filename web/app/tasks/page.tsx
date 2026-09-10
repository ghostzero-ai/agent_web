import Link from "next/link";
import { TaskManager } from "@/components/tasks/TaskManager";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">任务与提醒</h1>
          <p className="text-xs text-zinc-500">建立任务；自动触发将在下一阶段接入</p>
        </div>
        <nav className="flex gap-4 text-sm font-medium text-zinc-500">
          <Link href="/chat" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">对话</Link>
          <Link href="/api-key" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">API 配置</Link>
        </nav>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-10">
        <TaskManager />
      </main>
    </div>
  );
}
