import { PersonaProfileManager } from "@/components/persona/PersonaProfileManager";
import { AppLink } from "@/components/platform/AppLink";

export const dynamic = "force-dynamic";

export default function PersonaPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">人格设置</h1>
          <p className="hidden text-xs text-zinc-500 sm:block">稳定表达风格，不降低专业与安全标准</p>
        </div>
        <nav className="flex shrink-0 gap-3 text-xs font-medium text-zinc-500 sm:gap-4 sm:text-sm">
          <AppLink href="/voice" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">语音</AppLink>
          <AppLink href="/memory" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">记忆</AppLink>
          <AppLink href="/chat" className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-100">对话</AppLink>
        </nav>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-10"><PersonaProfileManager /></main>
    </div>
  );
}
