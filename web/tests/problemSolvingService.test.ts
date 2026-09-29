import { describe, expect, it } from "vitest";
import {
  createProblemSolvingService,
  type ProblemGatewayPort,
} from "@/lib/problemSolving/service";

function gateway() {
  const entries = new Map<string, { value: unknown; version: number; updatedAt: Date }>();
  const calls: Array<{ capabilityId: string; payload: unknown }> = [];
  const port: ProblemGatewayPort = {
    async invoke(input) {
      calls.push({ capabilityId: input.capabilityId, payload: input.payload });
      if (input.capabilityId === "storage.read-write") {
        const request = input.payload as {
          operation: "get" | "list" | "set" | "delete";
          key?: string;
          prefix?: string;
          value?: unknown;
          expectedVersion?: number;
        };
        if (request.operation === "list") {
          return {
            requestId: crypto.randomUUID(),
            data: [...entries.entries()]
              .filter(([key]) => key.startsWith(request.prefix ?? ""))
              .map(([key, entry]) => ({ key, byteSize: 1, ...entry })),
          };
        }
        const key = request.key ?? "";
        const current = entries.get(key);
        if (request.operation === "get") {
          return {
            requestId: crypto.randomUUID(),
            data: current ? { key, byteSize: 1, ...current } : null,
          };
        }
        if (request.operation === "delete") {
          if (!current || current.version !== request.expectedVersion) throw new Error("conflict");
          entries.delete(key);
          return { requestId: crypto.randomUUID(), data: true };
        }
        if ((current?.version ?? 0) !== request.expectedVersion) throw new Error("conflict");
        const saved = {
          value: request.value,
          version: (current?.version ?? 0) + 1,
          updatedAt: new Date("2026-09-29T08:00:00.000Z"),
        };
        entries.set(key, saved);
        return { requestId: crypto.randomUUID(), data: { key, byteSize: 1, ...saved } };
      }
      if (input.capabilityId === "task.create-draft") {
        const payload = input.payload as { title: string; prompt: string; runAt: string };
        return {
          requestId: crypto.randomUUID(),
          data: {
            title: payload.title,
            prompt: payload.prompt,
            kind: "reminder",
            schedule: { type: "once", runAt: payload.runAt },
          },
        };
      }
      const payload = input.payload as { purpose: string };
      if (payload.purpose === "problem-solving.review-card") {
        return {
          requestId: crypto.randomUUID(),
          data: {
            front: "计算前应先检查什么？",
            back: "先确认运算顺序，再逐步计算。",
            reason: "本题出现了计算顺序错误。",
            tags: ["运算顺序"],
            model: "test-model",
          },
        };
      }
      return {
        requestId: crypto.randomUUID(),
        data: {
          subject: "math",
          problemSummary: "计算 2+3",
          response: "你的答案与计算结果不一致。",
          assessment: "partially_correct",
          misconception: "基础加法计算错误",
          errorTags: ["计算错误"],
          nextQuestion: "请重新计算 2+3。",
          model: "test-model",
        },
      };
    },
  };
  return { port, calls };
}

describe("Phase 7.4 problem-solving service", () => {
  it("records strategy feedback, host verification, a review card and a task draft", async () => {
    const fake = gateway();
    const service = createProblemSolvingService(fake.port, () => new Date("2026-09-29T08:00:00.000Z"));
    const created = await service.create({
      title: "加法错题",
      problemText: "计算 2+3",
      image: null,
    });
    const response = await service.respond(created.problemCase.id, {
      strategy: "check",
      userAnswer: "4",
      imageDataUrl: null,
      expectedVersion: created.storageVersion,
    });
    expect(response).toMatchObject({
      attempt: {
        assessment: "incorrect",
        misconception: "基础加法计算错误",
        toolVerification: { status: "mismatch", expected: 5, submitted: 4 },
      },
    });
    const card = await service.createReviewCard(created.problemCase.id, {
      attemptId: response!.attempt.id,
      expectedVersion: response!.storageVersion,
    });
    expect(card).toMatchObject({ card: { tags: ["运算顺序"] } });
    await expect(service.createTaskDraft(created.problemCase.id, {
      cardId: card!.card.id,
      expectedVersion: card!.storageVersion,
    })).resolves.toMatchObject({ kind: "reminder" });
    expect(await service.list()).toMatchObject([{ attemptCount: 1, reviewCardCount: 1 }]);
    expect(fake.calls.map((call) => call.capabilityId)).toEqual(expect.arrayContaining([
      "storage.read-write",
      "model.generate",
      "task.create-draft",
    ]));
  });

  it("stores image metadata but never persists the image data URL", async () => {
    const fake = gateway();
    const service = createProblemSolvingService(fake.port, () => new Date("2026-09-29T08:00:00.000Z"));
    const dataUrl = `data:image/jpeg;base64,${Buffer.from("private-image-bytes").toString("base64")}`;
    const created = await service.create({
      title: "图片题",
      problemText: "",
      image: { dataUrl, name: "question.jpg" },
    });
    expect(created.problemCase.image).toMatchObject({ name: "question.jpg", mimeType: "image/jpeg" });
    expect(JSON.stringify(created)).not.toContain(dataUrl);
    const storageWrites = fake.calls.filter((call) =>
      call.capabilityId === "storage.read-write" &&
      (call.payload as { operation?: string }).operation === "set",
    );
    expect(JSON.stringify(storageWrites)).not.toContain(dataUrl);
  });
});
