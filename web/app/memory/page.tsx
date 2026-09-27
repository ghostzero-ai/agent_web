import { AppLink } from "@/components/platform/AppLink";
import { MemoryCandidateManager } from "@/components/memory/MemoryCandidateManager";
import { MemoryManager } from "@/components/memory/MemoryManager";

export const dynamic = "force-dynamic";

export default function MemoryPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">记忆</h1>
          <p className="hidden text-xs text-zinc-500 sm:block">管理长期记忆，并审核新的记忆候选</p>
        </div>
        <nav className="flex shrink-0 gap-3 text-xs font-medium text-zinc-500 sm:gap-4 sm:text-sm">
          <AppLink href="/chat" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">对话</AppLink>
          <AppLink href="/reflection" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">反思</AppLink>
          <AppLink href="/tasks" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">任务</AppLink>
        </nav>
      </header>
      <main className="space-y-10 px-4 py-6 sm:px-6 sm:py-10">
        <MemoryManager />
        <MemoryCandidateManager />
      </main>
    </div>
  );
}
