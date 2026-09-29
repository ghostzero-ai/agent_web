import { z } from "zod";
import type {
  PluginCapabilityGateway,
  PluginExecutionContext,
} from "@/lib/plugins/capabilityGateway";
import {
  problemResponseResultSchema,
  problemReviewCardResultSchema,
  taskDraftResultSchema,
} from "@/lib/plugins/hostCapabilityAdapters";
import {
  MAX_PROBLEM_ATTEMPTS,
  MAX_PROBLEM_CASES,
  MAX_REVIEW_CARDS,
  PROBLEM_SOLVING_PLUGIN_ID,
  problemCaseSchema,
  problemImageMetadataSchema,
  problemStorageKey,
  problemStrategySchema,
  summarizeProblemCase,
  type ProblemCase,
} from "@/lib/problemSolving/domain";
import { verifyBasicArithmetic } from "@/lib/problemSolving/arithmeticVerifier";

const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/]+=*)$/u;

const storageEntrySchema = z
  .object({
    key: z.string(),
    value: z.unknown(),
    byteSize: z.number(),
    version: z.number().int().positive(),
    updatedAt: z.coerce.date(),
  })
  .strict();

const imageInputSchema = z
  .object({
    dataUrl: z.string().max(5_400_000).regex(IMAGE_DATA_URL),
    name: z.string().trim().min(1).max(180),
  })
  .strict();

export const createProblemCaseInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    problemText: z.string().trim().max(8_000),
    image: imageInputSchema.nullable(),
  })
  .strict()
  .refine((value) => Boolean(value.problemText) || value.image !== null, {
    message: "请输入题目文字或上传题目图片。",
  });

export const problemInteractionInputSchema = z
  .object({
    strategy: problemStrategySchema,
    userAnswer: z.string().trim().max(6_000).nullable(),
    imageDataUrl: z.string().max(5_400_000).regex(IMAGE_DATA_URL).nullable(),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) => value.strategy !== "check" || Boolean(value.userAnswer),
    { message: "检查答案模式需要先填写你的答案。", path: ["userAnswer"] },
  );

export const reviewCardInputSchema = z
  .object({
    attemptId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const problemTaskDraftInputSchema = z
  .object({
    cardId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const deleteProblemCaseInputSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

const modelResponseSchema = problemResponseResultSchema.extend({ model: z.string().min(1) });
const modelCardSchema = problemReviewCardResultSchema.extend({ model: z.string().min(1) });

export type ProblemGatewayPort = Pick<PluginCapabilityGateway, "invoke">;
export type ProblemTaskDraft = z.infer<typeof taskDraftResultSchema>;

const foregroundContext: PluginExecutionContext = {
  execution: "foreground",
  runId: null,
  userInitiated: true,
};

function imageMetadata(image: z.infer<typeof imageInputSchema>) {
  const match = IMAGE_DATA_URL.exec(image.dataUrl);
  if (!match) throw new ProblemSolvingServiceError("IMAGE_INVALID", "题目图片格式无效。");
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  const byteSize = Math.floor((match[2].length * 3) / 4) - padding;
  if (byteSize < 1 || byteSize > 4_000_000) {
    throw new ProblemSolvingServiceError("IMAGE_TOO_LARGE", "处理后的题目图片不能超过 4 MB。");
  }
  return problemImageMetadataSchema.parse({
    name: image.name,
    mimeType: match[1],
    byteSize,
  });
}

export function createProblemSolvingService(
  gatewayOrFactory: ProblemGatewayPort | (() => ProblemGatewayPort),
  now: () => Date = () => new Date(),
) {
  const gateway = () =>
    typeof gatewayOrFactory === "function" ? gatewayOrFactory() : gatewayOrFactory;

  async function storage(operation: unknown): Promise<unknown> {
    return (await gateway().invoke({
      pluginId: PROBLEM_SOLVING_PLUGIN_ID,
      capabilityId: "storage.read-write",
      payload: operation,
      context: foregroundContext,
    })).data;
  }

  async function readCase(id: string): Promise<{
    problemCase: ProblemCase;
    storageVersion: number;
  } | null> {
    const result = await storage({ operation: "get", key: problemStorageKey(id) });
    if (result === null) return null;
    const entry = storageEntrySchema.parse(result);
    return { problemCase: problemCaseSchema.parse(entry.value), storageVersion: entry.version };
  }

  async function listCases() {
    const entries = z.array(storageEntrySchema).parse(await storage({
      operation: "list",
      prefix: "problem-solving/cases/",
      limit: MAX_PROBLEM_CASES,
    }));
    return entries
      .map((entry) => problemCaseSchema.parse(entry.value))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function save(problemCase: ProblemCase, expectedVersion: number) {
    const saved = storageEntrySchema.parse(await storage({
      operation: "set",
      key: problemStorageKey(problemCase.id),
      value: problemCaseSchema.parse(problemCase),
      expectedVersion,
    }));
    return { problemCase, storageVersion: saved.version };
  }

  function assertVersion(stored: { storageVersion: number }, expectedVersion: number) {
    if (stored.storageVersion !== expectedVersion) {
      throw new ProblemSolvingServiceError(
        "PROBLEM_VERSION_CONFLICT",
        "题目记录已发生变化，请刷新后重试。",
      );
    }
  }

  return {
    async list() {
      return (await listCases()).map(summarizeProblemCase);
    },

    get(id: string) {
      return readCase(id);
    },

    async create(rawInput: unknown) {
      const input = createProblemCaseInputSchema.parse(rawInput);
      if ((await listCases()).length >= MAX_PROBLEM_CASES) {
        throw new ProblemSolvingServiceError(
          "PROBLEM_LIMIT_REACHED",
          `最多保留 ${MAX_PROBLEM_CASES} 道题，请先整理旧记录。`,
        );
      }
      const timestamp = now().toISOString();
      const problemCase: ProblemCase = {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        title: input.title,
        problemText: input.problemText,
        normalizedProblem: null,
        image: input.image ? imageMetadata(input.image) : null,
        subject: null,
        attempts: [],
        reviewCards: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const saved = await save(problemCase, 0);
      return saved;
    },

    async delete(id: string, rawInput: unknown) {
      const input = deleteProblemCaseInputSchema.parse(rawInput);
      return storage({
        operation: "delete",
        key: problemStorageKey(id),
        expectedVersion: input.expectedVersion,
      });
    },

    async respond(id: string, rawInput: unknown) {
      const input = problemInteractionInputSchema.parse(rawInput);
      const stored = await readCase(id);
      if (!stored) return null;
      assertVersion(stored, input.expectedVersion);
      if (!stored.problemCase.problemText.trim() &&
          !stored.problemCase.normalizedProblem &&
          !input.imageDataUrl) {
        throw new ProblemSolvingServiceError(
          "IMAGE_REQUIRED",
          "这道题只保存了图片元数据，请重新上传图片后继续。",
        );
      }
      const problemText = stored.problemCase.normalizedProblem ?? stored.problemCase.problemText;
      const verification = verifyBasicArithmetic(problemText, input.userAnswer);
      const priorContext = stored.problemCase.attempts
        .slice(-3)
        .map((attempt) => `${attempt.strategy}: ${attempt.response.slice(0, 700)}`)
        .join("\n")
        .slice(0, 3_000);
      const generated = await gateway().invoke({
        pluginId: PROBLEM_SOLVING_PLUGIN_ID,
        capabilityId: "model.generate",
        payload: {
          purpose: "problem-solving.respond",
          title: stored.problemCase.title,
          problemText,
          strategy: input.strategy,
          userAnswer: input.userAnswer,
          priorContext,
          toolEvidence: JSON.stringify(verification),
          imageDataUrl: input.imageDataUrl,
        },
        context: foregroundContext,
      });
      const modelResult = modelResponseSchema.parse(generated.data);
      const timestamp = now().toISOString();
      const attempt = {
        id: crypto.randomUUID(),
        strategy: input.strategy,
        userAnswer: input.userAnswer,
        response: modelResult.response,
        assessment:
          input.strategy === "check" && verification.status === "mismatch"
            ? "incorrect" as const
            : modelResult.assessment,
        misconception: modelResult.misconception,
        errorTags: modelResult.errorTags,
        nextQuestion: modelResult.nextQuestion,
        toolVerification: verification,
        model: modelResult.model,
        createdAt: timestamp,
      };
      const problemCase = problemCaseSchema.parse({
        ...stored.problemCase,
        normalizedProblem: modelResult.problemSummary,
        subject: modelResult.subject,
        attempts: [...stored.problemCase.attempts, attempt].slice(-MAX_PROBLEM_ATTEMPTS),
        updatedAt: timestamp,
      });
      return { ...(await save(problemCase, input.expectedVersion)), attempt };
    },

    async createReviewCard(id: string, rawInput: unknown) {
      const input = reviewCardInputSchema.parse(rawInput);
      const stored = await readCase(id);
      if (!stored) return null;
      assertVersion(stored, input.expectedVersion);
      if (stored.problemCase.reviewCards.length >= MAX_REVIEW_CARDS) {
        throw new ProblemSolvingServiceError(
          "REVIEW_CARD_LIMIT_REACHED",
          `每道题最多保留 ${MAX_REVIEW_CARDS} 张复习卡。`,
        );
      }
      const attempt = stored.problemCase.attempts.find((item) => item.id === input.attemptId);
      if (!attempt) {
        throw new ProblemSolvingServiceError("ATTEMPT_NOT_FOUND", "解题记录不存在。");
      }
      const generated = await gateway().invoke({
        pluginId: PROBLEM_SOLVING_PLUGIN_ID,
        capabilityId: "model.generate",
        payload: {
          purpose: "problem-solving.review-card",
          title: stored.problemCase.title,
          problemSummary: stored.problemCase.normalizedProblem ?? stored.problemCase.problemText,
          userAnswer: attempt.userAnswer,
          misconception: attempt.misconception,
          errorTags: attempt.errorTags,
          response: attempt.response,
        },
        context: foregroundContext,
      });
      const cardResult = modelCardSchema.parse(generated.data);
      const timestamp = now().toISOString();
      const card = {
        id: crypto.randomUUID(),
        sourceAttemptId: attempt.id,
        front: cardResult.front,
        back: cardResult.back,
        reason: cardResult.reason,
        tags: cardResult.tags,
        createdAt: timestamp,
      };
      const problemCase = problemCaseSchema.parse({
        ...stored.problemCase,
        reviewCards: [...stored.problemCase.reviewCards, card],
        updatedAt: timestamp,
      });
      return { ...(await save(problemCase, input.expectedVersion)), card };
    },

    async createTaskDraft(id: string, rawInput: unknown): Promise<ProblemTaskDraft | null> {
      const input = problemTaskDraftInputSchema.parse(rawInput);
      const stored = await readCase(id);
      if (!stored) return null;
      assertVersion(stored, input.expectedVersion);
      const card = stored.problemCase.reviewCards.find((item) => item.id === input.cardId);
      if (!card) throw new ProblemSolvingServiceError("REVIEW_CARD_NOT_FOUND", "复习卡不存在。");
      const runAt = new Date(now());
      runAt.setUTCDate(runAt.getUTCDate() + 3);
      const draft = await gateway().invoke({
        pluginId: PROBLEM_SOLVING_PLUGIN_ID,
        capabilityId: "task.create-draft",
        payload: {
          purpose: "problem-solving.review",
          title: `错题复习：${stored.problemCase.title}`,
          prompt: `打开解题训练，复习卡片：“${card.front}”`,
          runAt: runAt.toISOString(),
        },
        context: foregroundContext,
      });
      return taskDraftResultSchema.parse(draft.data);
    },
  };
}

export class ProblemSolvingServiceError extends Error {
  constructor(
    readonly code:
      | "IMAGE_INVALID"
      | "IMAGE_TOO_LARGE"
      | "IMAGE_REQUIRED"
      | "PROBLEM_LIMIT_REACHED"
      | "PROBLEM_VERSION_CONFLICT"
      | "REVIEW_CARD_LIMIT_REACHED"
      | "ATTEMPT_NOT_FOUND"
      | "REVIEW_CARD_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ProblemSolvingServiceError";
  }
}
