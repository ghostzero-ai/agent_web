import Link from "next/link";

type ChatErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};

export function ChatErrorBanner({
  message,
  onDismiss,
}: ChatErrorBannerProps) {
  return (
    <div className="mx-6 mt-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
      <p className="flex-1 text-sm text-red-700 dark:text-red-400">{message}</p>
      <Link
        href="/api-key"
        className="text-sm font-medium text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
      >
        前往配置
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        className="text-sm font-medium text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
      >
        关闭
      </button>
    </div>
  );
}
