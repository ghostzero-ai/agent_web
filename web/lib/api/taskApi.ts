import { z, ZodError, type ZodType } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createTaskRepository,
  TaskRepositoryError,
  type TaskRepositoryPort,
} from "@/lib/repositories/taskRepository";
import {
  normalizeTaskSchedule,
  TaskScheduleError,
  type TaskSchedule,
} from "@/lib/tasks/schedule";

type TaskApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "TASK_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class TaskApiInputError extends Error {
  constructor(
    readonly code: Extract<
      TaskApiErrorCode,
      "INVALID_JSON" | "INVALID_REQUEST"
    >,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "TaskApiInputError";
  }
}

const taskIdSchema = z.uuid();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const taskScheduleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("once"),
      runAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z.object({ type: z.literal("daily"), time: timeSchema }).strict(),
  z
    .object({
      type: z.literal("weekly"),
      weekday: z.number().int().min(1).max(7),
      time: timeSchema,
    })
    .strict(),
]);
const taskFields = {
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().max(10_000).nullable().default(null),
  schedule: taskScheduleSchema,
};
const taskKindSchema = z.enum(["reminder", "agent_prompt"]);
const taskPromptRule = (input: { kind?: "reminder" | "agent_prompt"; prompt: string | null }) =>
  input.kind !== "agent_prompt" || Boolean(input.prompt?.trim());
const createTaskSchema = z
  .object({ ...taskFields, kind: taskKindSchema.default("reminder") })
  .strict()
  .refine(taskPromptRule, {
    message: "Agent Prompt tasks require a prompt.",
    path: ["prompt"],
  });
const updateTaskSchema = z
  .object({
    ...taskFields,
    kind: taskKindSchema.optional(),
    status: z.enum(["active", "paused"]),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine(taskPromptRule, {
    message: "Agent Prompt tasks require a prompt.",
    path: ["prompt"],
  });

function responseHeaders(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function jsonResponse(
  requestId: string,
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: { ...responseHeaders(requestId), ...headers },
  });
}

function errorResponse(
  requestId: string,
  status: number,
  code: TaskApiErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return jsonResponse(
    requestId,
    {
      error: {
        code,
        message,
        retryable,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}

async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new TaskApiInputError(
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TaskApiInputError(
        "INVALID_REQUEST",
        "Request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

function parseTaskId(id: string): string {
  const result = taskIdSchema.safeParse(id);
  if (!result.success) {
    throw new TaskApiInputError(
      "INVALID_REQUEST",
      "Task id must be a UUID.",
      result.error.issues,
    );
  }
  return result.data;
}

async function handleRequest(
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof TaskApiInputError || error instanceof TaskScheduleError) {
      return errorResponse(
        requestId,
        400,
        error instanceof TaskApiInputError ? error.code : "INVALID_REQUEST",
        error.message,
        false,
        error instanceof TaskApiInputError ? error.details : undefined,
      );
    }
    if (error instanceof TaskRepositoryError) {
      return errorResponse(
        requestId,
        error.code === "TASK_NOT_FOUND" ? 404 : 409,
        error.code,
        error.message,
        false,
      );
    }
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Task API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createTaskApi(
  repositoryOrFactory: TaskRepositoryPort | (() => TaskRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = (): TaskRepositoryPort =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;

  return {
    list(): Promise<Response> {
      return handleRequest(async (requestId) =>
        jsonResponse(requestId, { data: await repository().list() }),
      );
    },

    create(request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const input = await parseBody(request, createTaskSchema);
        const schedule = normalizeTaskSchedule(
          input.schedule as TaskSchedule,
          now(),
        );
        const task = await repository().create({
          title: input.title,
          prompt: input.prompt,
          kind: input.kind,
          ...schedule,
        });
        return jsonResponse(requestId, { data: task }, 201, {
          location: `/api/v1/tasks/${task.id}`,
        });
      });
    },

    get(id: string): Promise<Response> {
      return handleRequest(async (requestId) => {
        const task = await repository().get(parseTaskId(id));
        return task
          ? jsonResponse(requestId, { data: task })
          : errorResponse(
              requestId,
              404,
              "TASK_NOT_FOUND",
              "Task was not found.",
              false,
            );
      });
    },

    update(id: string, request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const taskId = parseTaskId(id);
        const input = await parseBody(request, updateTaskSchema);
        const schedule = normalizeTaskSchedule(
          input.schedule as TaskSchedule,
          now(),
        );
        const task = await repository().update(taskId, {
          title: input.title,
          prompt: input.prompt,
          kind: input.kind,
          status: input.status,
          expectedVersion: input.expectedVersion,
          ...schedule,
        });
        return jsonResponse(requestId, { data: task });
      });
    },

    delete(id: string): Promise<Response> {
      return handleRequest(async (requestId) => {
        const deleted = await repository().delete(parseTaskId(id));
        if (!deleted) {
          return errorResponse(
            requestId,
            404,
            "TASK_NOT_FOUND",
            "Task was not found.",
            false,
          );
        }
        return new Response(null, {
          status: 204,
          headers: responseHeaders(requestId),
        });
      });
    },
  };
}

export function getTaskApi() {
  return createTaskApi(() => createTaskRepository(getDatabase()));
}
