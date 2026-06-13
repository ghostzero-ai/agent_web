import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
            AI 学习伴侣
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            你的专属 AI 学习伙伴
          </p>
        </div>

        <Link
          href="/chat"
          className="mt-10 inline-flex rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          开始对话
        </Link>
      </main>
    </div>
  );
}
