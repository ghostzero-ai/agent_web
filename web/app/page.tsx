export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
            AI 学习伴侣
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            你的专属 AI 学习伙伴
          </p>
        </div>

        {/* CTA Button */}
        <button
          type="button"
          className="mt-10 rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          开始对话
        </button>

        {/* Feature Cards */}
        <section className="mt-20 grid w-full max-w-4xl gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              情感助手
            </h2>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              学习助手
            </h2>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              自带 API Key
            </h2>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 px-6 py-6 text-center dark:border-zinc-800">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          基于 Next.js 与 TypeScript 构建
        </p>
      </footer>
    </div>
  );
}
