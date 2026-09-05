import Link from "next/link";
import { LegacyApiConfigCleanup } from "@/components/config/LegacyApiConfigCleanup";
import { getModelProviderStatus } from "@/lib/ai/server/modelConfig";

export const dynamic = "force-dynamic";

export default function ApiKeyPage() {
  const status = getModelProviderStatus();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <LegacyApiConfigCleanup />
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          模型服务配置
        </h1>
        <Link
          href="/chat"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          返回对话
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl space-y-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              服务端环境变量
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              为避免 API Key 暴露给浏览器，请在服务器的
              <code className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-900">
                web/.env.local
              </code>
              中配置 AI_API_KEY、AI_BASE_URL 和 AI_MODEL，然后重启服务。
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500 dark:text-zinc-400">状态</span>
              <span
                className={
                  status.configured
                    ? "font-medium text-green-700 dark:text-green-400"
                    : "font-medium text-amber-700 dark:text-amber-400"
                }
              >
                {status.configured ? "已配置" : "未完成"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500 dark:text-zinc-400">Provider</span>
              <span className="break-all text-right text-zinc-800 dark:text-zinc-200">
                {status.baseUrl ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500 dark:text-zinc-400">Model</span>
              <span className="break-all text-right text-zinc-800 dark:text-zinc-200">
                {status.model ?? "—"}
              </span>
            </div>
            {!status.configured && (
              <p className="border-t border-zinc-200 pt-3 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                缺少：{status.missing.join("、")}
              </p>
            )}
          </div>

          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-500">
            页面只显示配置状态、Provider Origin 和模型名；真实 API Key
            不会进入 HTML、客户端状态或 localStorage。
          </p>
        </div>
      </main>
    </div>
  );
}
