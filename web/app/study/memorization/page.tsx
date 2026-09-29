import { MemorizationActivity } from "@/components/memorization/MemorizationActivity";
import { AppLink } from "@/components/platform/AppLink";

export const dynamic = "force-dynamic";

export default function MemorizationPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div><h1 className="text-lg font-semibold">背书训练</h1><p className="hidden text-xs text-zinc-500 sm:block">材料导入、复述反馈、薄弱点与间隔复习</p></div>
        <nav className="flex gap-3 text-xs font-medium text-zinc-500 sm:text-sm"><AppLink href="/plugins" className="hover:text-zinc-950 dark:hover:text-zinc-100">插件</AppLink><AppLink href="/tasks" className="hover:text-zinc-950 dark:hover:text-zinc-100">任务</AppLink><AppLink href="/chat" className="hover:text-zinc-950 dark:hover:text-zinc-100">对话</AppLink></nav>
      </header>
      <div className="px-4 py-6 sm:px-6 sm:py-10"><MemorizationActivity /></div>
    </div>
  );
}
