/**
 * 会被持久化并展示给用户的真实会话消息。
 * 系统指令、记忆上下文和工具过程不得写入这个类型。
 */
export type ChatMessage = {
  id?: string;
  parentId?: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  versions?: string[];
  activeVersion?: number;
};

export type PromptMessage =
  | {
      kind: "instruction";
      source: "persona";
      role: "system";
      content: string;
    }
  | {
      kind: "context";
      source: "memory";
      role: "system";
      content: string;
    }
  | {
      kind: "conversation";
      source: "conversation";
      role: ChatMessage["role"];
      content: string;
    };

/**
 * 当前 OpenAI-compatible Chat Completions 的最小传输格式。
 * Prompt 的 kind/source 只供内部策略与审计使用，不发送给 Provider。
 */
export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function toChatCompletionMessages(
  messages: PromptMessage[],
): ChatCompletionMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}
