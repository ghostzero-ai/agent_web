import {
  createPromptEnvelope,
  type PromptEnvelope,
  type PromptTrigger,
} from "@/lib/ai/promptEnvelope";
import type { PromptMessage } from "@/lib/ai/messages";

export const TEST_CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_LEAF_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_RUN_ID = "33333333-3333-4333-8333-333333333333";

export const TEST_PROMPT: PromptMessage[] = [
  {
    kind: "instruction",
    source: "policy",
    role: "system",
    content: "核心策略",
  },
  {
    kind: "context",
    source: "memory",
    role: "system",
    content: "用户偏好：先看例子",
  },
  {
    kind: "conversation",
    source: "conversation",
    role: "user",
    content: "解释 ``` 极限",
  },
];

export function createTestPromptEnvelope(options: {
  runId?: string;
  conversationId?: string;
  activeLeafId?: string | null;
  title?: string;
  trigger?: PromptTrigger;
  prompt?: PromptMessage[];
  createdAt?: string;
} = {}): Promise<PromptEnvelope> {
  return createPromptEnvelope({
    runId: options.runId ?? TEST_RUN_ID,
    createdAt: options.createdAt ?? "2026-09-26T01:02:03.000Z",
    trigger: options.trigger ?? "send",
    conversation: {
      id: options.conversationId ?? TEST_CONVERSATION_ID,
      title: options.title ?? "分数与极限 / 测试",
      activeLeafId:
        options.activeLeafId === undefined ? TEST_LEAF_ID : options.activeLeafId,
    },
    prompt: options.prompt ?? TEST_PROMPT,
    provider: {
      provider: "openai-compatible",
      baseUrl: "https://provider.example/v1",
      model: "study-model",
    },
  });
}
