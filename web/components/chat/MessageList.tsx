import type { ChatMessage } from "@/lib/config";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

type MessageListProps = {
  hasActiveSession: boolean;
  messages: ChatMessage[];
  allMessages: ChatMessage[];
  loading: boolean;
  onRetry: (messageId: string) => void;
  onSwitchVersion: (
    messageId: string,
    direction: "prev" | "next",
  ) => void;
};

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageList({
  hasActiveSession,
  messages,
  allMessages,
  loading,
  onRetry,
  onSwitchVersion,
}: MessageListProps) {
  if (!hasActiveSession) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
          开始你的第一段对话
        </h2>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          打开对话列表并点击「新建对话」开始
        </p>
      </div>
    );
  }

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
          开始你的第一段对话
        </h2>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          输入问题，AI 将为你提供帮助
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {messages.map((message, index) => {
        const versions =
          message.role === "assistant" && message.id
            ? allMessages.filter(
                (candidate) =>
                  candidate.role === "assistant" &&
                  (candidate.parentId ?? null) ===
                    (message.parentId ?? null),
              )
            : [];
        const activeVersion = versions.findIndex(
          (candidate) => candidate.id === message.id,
        );
        const hasVersions = versions.length > 1 && activeVersion !== -1;

        return (
          <div
            key={message.id ?? index}
            className={`flex flex-col ${
              message.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black"
                  : "border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              }`}
            >
              <MarkdownMessage content={message.content} />
            </div>

            <div
              className={`mt-1 flex flex-wrap items-center gap-2 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.createdAt && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {formatMessageTime(message.createdAt)}
                </span>
              )}

              {hasVersions && (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <button
                    type="button"
                    onClick={() => onSwitchVersion(message.id!, "prev")}
                    disabled={activeVersion === 0}
                    aria-label="上一个回答版本"
                    className="hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-300"
                  >
                    ◀
                  </button>
                  <span>
                    {activeVersion + 1}/{versions.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSwitchVersion(message.id!, "next")}
                    disabled={activeVersion === versions.length - 1}
                    aria-label="下一个回答版本"
                    className="hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-300"
                  >
                    ▶
                  </button>
                </span>
              )}

              {message.role === "assistant" && message.id && !loading && (
                <button
                  type="button"
                  onClick={() => onRetry(message.id!)}
                  className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  重新生成
                </button>
              )}
            </div>
          </div>
        );
      })}

      {loading && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            AI 思考中...
          </div>
        </div>
      )}
    </div>
  );
}
