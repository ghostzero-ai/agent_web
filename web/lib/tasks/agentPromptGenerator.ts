import type { ChatCompletionMessage } from "@/lib/ai/messages";
import {
  ModelProviderError,
  OpenAICompatibleProvider,
  type ModelProvider,
} from "@/lib/ai/server/modelProvider";
import {
  resolveModelProviderConfig,
} from "@/lib/ai/server/modelCredentialService";
import {
  ModelConfigError,
  type ModelProviderConfig,
} from "@/lib/ai/server/modelConfig";

const MAX_AGENT_RESULT_LENGTH = 100_000;

const SCHEDULED_TASK_SYSTEM_PROMPT = `你正在执行用户预先安排的定时任务。
请直接完成用户给出的任务，并输出可独立阅读的最终内容。
除非用户另有要求，使用中文；不要声称已经执行你无法执行的现实世界操作。`;

export type AgentPromptResult = {
  content: string;
  model: string;
};

export interface AgentPromptGeneratorPort {
  generate(prompt: string, signal?: AbortSignal): Promise<AgentPromptResult>;
}

export class AgentPromptGenerationError extends Error {
  constructor(
    readonly code:
      | "MODEL_CONFIGURATION_ERROR"
      | "AGENT_PROMPT_MISSING"
      | "AGENT_OUTPUT_EMPTY"
      | "AGENT_OUTPUT_TOO_LARGE"
      | ModelProviderError["code"],
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AgentPromptGenerationError";
  }
}

type AgentPromptGeneratorDependencies = {
  getConfig: () => ModelProviderConfig | Promise<ModelProviderConfig>;
  createProvider: (config: ModelProviderConfig) => ModelProvider;
};

function promptMessages(prompt: string): ChatCompletionMessage[] {
  return [
    { role: "system", content: SCHEDULED_TASK_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
}

export function createAgentPromptGenerator(
  dependencies: AgentPromptGeneratorDependencies = {
    getConfig: resolveModelProviderConfig,
    createProvider: (config) => new OpenAICompatibleProvider(config),
  },
): AgentPromptGeneratorPort {
  return {
    async generate(prompt, signal) {
      let config: ModelProviderConfig;
      try {
        config = await dependencies.getConfig();
      } catch (error) {
        if (error instanceof ModelConfigError) {
          throw new AgentPromptGenerationError(
            "MODEL_CONFIGURATION_ERROR",
            "Server model provider is not configured.",
            false,
          );
        }
        throw error;
      }

      let content = "";
      const providerController = new AbortController();
      const providerSignal = signal
        ? AbortSignal.any([signal, providerController.signal])
        : providerController.signal;
      try {
        for await (const event of dependencies
          .createProvider(config)
          .stream({ messages: promptMessages(prompt) }, providerSignal)) {
          if (event.type !== "delta") continue;
          content += event.text;
          if (content.length > MAX_AGENT_RESULT_LENGTH) {
            providerController.abort("Agent task output is too large.");
            throw new AgentPromptGenerationError(
              "AGENT_OUTPUT_TOO_LARGE",
              "Agent task output exceeded the supported size.",
              false,
            );
          }
        }
      } catch (error) {
        if (error instanceof AgentPromptGenerationError) throw error;
        if (error instanceof ModelProviderError) {
          throw new AgentPromptGenerationError(
            error.code,
            error.message,
            error.retryable,
          );
        }
        throw error;
      } finally {
        providerController.abort("Agent task generation finished.");
      }

      if (!content.trim()) {
        throw new AgentPromptGenerationError(
          "AGENT_OUTPUT_EMPTY",
          "Model provider returned no content for the Agent task.",
          false,
        );
      }
      return { content, model: config.model };
    },
  };
}
