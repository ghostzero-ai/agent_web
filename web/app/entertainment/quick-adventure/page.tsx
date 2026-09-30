import { QuickAdventureActivity } from "@/components/gameRulePacks/QuickAdventureActivity";
import { AppLink } from "@/components/platform/AppLink";

export default function QuickAdventurePage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div><h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">轻量冒险</h1><p className="text-xs text-zinc-500">规则包 · 世界与主角设定</p></div>
        <AppLink href="/entertainment" className="shrink-0 text-sm text-violet-700 dark:text-violet-300">游戏会话</AppLink>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-10"><QuickAdventureActivity /></main>
    </div>
  );
}
