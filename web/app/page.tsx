import { AppLink } from "@/components/platform/AppLink";
import { AppShell } from "@/components/ui/AppShell";

export default function Home() {
  return <AppShell route="/" title="AI 学习伴侣" description="学习、思考、生活，也留一点时间给故事。">
    <div className="mx-auto max-w-5xl py-6 sm:py-12">
      <p className="text-xs font-semibold tracking-widest text-emerald-700 dark:text-emerald-300">YOUR EVERYDAY COMPANION</p>
      <h2 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">好好学习，<br />也好好生活。</h2>
      <p className="mt-6 max-w-xl text-base leading-8 text-zinc-500">需要严谨的答案，或只是想说说话？知伴为不同的时刻准备了不同的空间，你可以随时选择。</p>
      <AppLink href="/chat" className="mt-8 inline-flex min-h-12 items-center gap-6 rounded-xl bg-emerald-700 px-6 text-sm font-medium text-white hover:bg-emerald-800">开始对话 <span aria-hidden="true">→</span></AppLink>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {[["/study", "学习与练习", "背诵、解题，让理解更扎实。"], ["/tasks", "任务与提醒", "安排好时间，结果不会错过。"], ["/entertainment", "故事与冒险", "为想象力留一个独立的世界。"]].map(([href, title, text]) => <AppLink key={href} href={href} className="rounded-2xl border border-zinc-200 bg-white p-6 hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950"><h3 className="font-semibold">{title} <span aria-hidden="true" className="float-right text-emerald-600">↗</span></h3><p className="mt-3 text-sm leading-7 text-zinc-500">{text}</p></AppLink>)}
      </div>
    </div>
  </AppShell>;
}
