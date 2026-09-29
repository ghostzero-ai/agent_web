import { z } from "zod";

export const PROBLEM_SOLVING_PLUGIN_ID = "study.problem-solving";
export const MAX_PROBLEM_CASES = 20;
export const MAX_PROBLEM_ATTEMPTS = 30;
export const MAX_REVIEW_CARDS = 12;

export const problemStrategySchema = z.enum(["hint", "guided", "check", "explain"]);
export const problemSubjectSchema = z.enum([
  "math",
  "physics",
  "chemistry",
  "language",
  "history",
  "programming",
  "other",
]);
export const answerAssessmentSchema = z.enum([
  "correct",
  "partially_correct",
  "incorrect",
  "not_applicable",
]);

export const toolVerificationSchema = z
  .object({
    status: z.enum(["verified", "mismatch", "not_applicable", "invalid"]),
    expression: z.string().max(240).nullable(),
    expected: z.number().finite().nullable(),
    submitted: z.number().finite().nullable(),
    note: z.string().max(300),
  })
  .strict();

export const problemAttemptSchema = z
  .object({
    id: z.string().uuid(),
    strategy: problemStrategySchema,
    userAnswer: z.string().max(6_000).nullable(),
    response: z.string().min(1).max(10_000),
    assessment: answerAssessmentSchema,
    misconception: z.string().max(500).nullable(),
    errorTags: z.array(z.string().max(80)).max(6),
    nextQuestion: z.string().max(500).nullable(),
    toolVerification: toolVerificationSchema,
    model: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

export const reviewCardSchema = z
  .object({
    id: z.string().uuid(),
    sourceAttemptId: z.string().uuid(),
    front: z.string().min(1).max(600),
    back: z.string().min(1).max(2_000),
    reason: z.string().min(1).max(500),
    tags: z.array(z.string().max(80)).max(6),
    createdAt: z.string().datetime(),
  })
  .strict();

export const problemImageMetadataSchema = z
  .object({
    name: z.string().min(1).max(180),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive().max(4_000_000),
  })
  .strict();

export const problemCaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    title: z.string().min(1).max(120),
    problemText: z.string().max(8_000),
    normalizedProblem: z.string().max(3_000).nullable(),
    image: problemImageMetadataSchema.nullable(),
    subject: problemSubjectSchema.nullable(),
    attempts: z.array(problemAttemptSchema).max(MAX_PROBLEM_ATTEMPTS),
    reviewCards: z.array(reviewCardSchema).max(MAX_REVIEW_CARDS),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine((value) => Boolean(value.problemText.trim()) || value.image !== null, {
    message: "Problem text or image is required.",
    path: ["problemText"],
  });

export const problemCaseSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    subject: problemSubjectSchema.nullable(),
    attemptCount: z.number().int().nonnegative(),
    reviewCardCount: z.number().int().nonnegative(),
    latestAssessment: answerAssessmentSchema.nullable(),
    latestErrorTags: z.array(z.string()),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ProblemStrategy = z.infer<typeof problemStrategySchema>;
export type ProblemCase = z.infer<typeof problemCaseSchema>;
export type ProblemCaseSummary = z.infer<typeof problemCaseSummarySchema>;
export type ProblemAttempt = z.infer<typeof problemAttemptSchema>;
export type ReviewCard = z.infer<typeof reviewCardSchema>;
export type ToolVerification = z.infer<typeof toolVerificationSchema>;

export function problemStorageKey(id: string): string {
  return `problem-solving/cases/${id}`;
}

export function summarizeProblemCase(value: ProblemCase): ProblemCaseSummary {
  const latest = value.attempts.at(-1) ?? null;
  return {
    id: value.id,
    title: value.title,
    subject: value.subject,
    attemptCount: value.attempts.length,
    reviewCardCount: value.reviewCards.length,
    latestAssessment: latest?.assessment ?? null,
    latestErrorTags: latest?.errorTags ?? [],
    updatedAt: value.updatedAt,
  };
}
