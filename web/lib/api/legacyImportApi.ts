import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createLegacyImportRepository,
  type LegacyImportRepositoryPort,
  type LegacyImportSession,
} from "@/lib/repositories/legacyImportRepository";

const messageSchema = z
  .object({
    id: z.string().min(1).max(200),
    parentId: z.string().min(1).max(200).nullable(),
    role: z.enum(["user", "assistant"]),
    content: z.string().max(1_000_000),
    createdAt: z.number().int().min(0).max(8_640_000_000_000_000),
  })
  .strict();

const sessionSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    messages: z.array(messageSchema).max(5_000),
    updatedAt: z.number().int().min(0).max(8_640_000_000_000_000),
    schemaVersion: z.literal(2).optional(),
    activeLeafId: z.string().min(1).max(200).nullable(),
  })
  .strict()
  .superRefine((session, context) => {
    const byId = new Map(session.messages.map((message) => [message.id, message]));
    if (byId.size !== session.messages.length) {
      context.addIssue({ code: "custom", message: "Message ids must be unique." });
      return;
    }

    const children = new Set<string>();
    for (const message of session.messages) {
      if (message.parentId === message.id) {
        context.addIssue({ code: "custom", message: "A message cannot parent itself." });
      } else if (message.parentId && !byId.has(message.parentId)) {
        context.addIssue({ code: "custom", message: "Every parent must exist in the same session." });
      } else if (message.parentId) {
        children.add(message.parentId);
      }

      const visited = new Set<string>();
      let current = message;
      while (current.parentId) {
        if (visited.has(current.id)) {
          context.addIssue({ code: "custom", message: "Conversation trees cannot contain cycles." });
          break;
        }
        visited.add(current.id);
        const parent = byId.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
    }

    if (session.messages.length === 0 && session.activeLeafId !== null) {
      context.addIssue({ code: "custom", message: "An empty session cannot select an active leaf." });
    }
    if (session.messages.length > 0) {
      if (!session.activeLeafId || !byId.has(session.activeLeafId)) {
        context.addIssue({ code: "custom", message: "A non-empty session must select an existing active leaf." });
      } else if (children.has(session.activeLeafId)) {
        context.addIssue({ code: "custom", message: "The active message must be a leaf." });
      }
    }
  });

const importRequestSchema = z
  .object({
    action: z.enum(["preview", "import"]),
    sessions: z.array(sessionSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const ids = new Set(input.sessions.map((session) => session.id));
    if (ids.size !== input.sessions.length) {
      context.addIssue({ code: "custom", message: "Session ids must be unique." });
    }
    const totalContent = input.sessions.reduce(
      (sessionTotal, session) =>
        sessionTotal +
        session.messages.reduce(
          (messageTotal, message) => messageTotal + message.content.length,
          0,
        ),
      0,
    );
    if (totalContent > 4_000_000) {
      context.addIssue({ code: "custom", message: "Import content is too large." });
    }
  });

function responseHeaders(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        retryable: status >= 500,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status, headers: responseHeaders(requestId) },
  );
}

async function parseRequest(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new SyntaxError("Request body must be valid JSON.");
  }
  return importRequestSchema.parse(input);
}

export function createLegacyImportApi(
  repositoryOrFactory:
    | LegacyImportRepositoryPort
    | (() => LegacyImportRepositoryPort),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;

  return {
    async execute(request: Request): Promise<Response> {
      const requestId = crypto.randomUUID();
      try {
        const input = await parseRequest(request);
        const sessions = input.sessions as LegacyImportSession[];
        const data =
          input.action === "preview"
            ? await repository().preview(sessions)
            : await repository().importSessions(sessions);
        return Response.json(
          { data },
          {
            status: input.action === "import" ? 201 : 200,
            headers: responseHeaders(requestId),
          },
        );
      } catch (error) {
        if (error instanceof SyntaxError) {
          return errorResponse(requestId, 400, "INVALID_JSON", error.message);
        }
        if (error instanceof ZodError) {
          return errorResponse(
            requestId,
            400,
            "INVALID_IMPORT",
            "Legacy session validation failed.",
            error.issues,
          );
        }
        const safeError =
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { name: "UnknownError" };
        console.error(`[api:${requestId}] Legacy import failed`, safeError);
        return errorResponse(
          requestId,
          500,
          "IMPORT_FAILED",
          "The server could not import legacy conversations.",
        );
      }
    },
  };
}

export function getLegacyImportApi() {
  return createLegacyImportApi(() =>
    createLegacyImportRepository(getDatabase()),
  );
}
