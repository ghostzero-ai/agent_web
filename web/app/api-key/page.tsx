import Link from "next/link";
import { LegacyApiConfigCleanup } from "@/components/config/LegacyApiConfigCleanup";
import { ModelCredentialSettings } from "@/components/config/ModelCredentialSettings";

export const dynamic = "force-dynamic";

export default function ApiKeyPage() {
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
        <ModelCredentialSettings />
      </main>
    </div>
  );
}
