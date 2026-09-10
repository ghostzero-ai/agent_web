import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTask,
  deleteTask,
  listTasks,
  TaskClientError,
  updateTask,
} from "@/lib/api/taskClient";

describe("task client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the versioned task endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "task-1" }] }),
      )
      .mockResolvedValueOnce(Response.json({ data: { id: "task-2" } }))
      .mockResolvedValueOnce(Response.json({ data: { id: "task-2" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await listTasks();
    await createTask({
      title: "阅读",
      prompt: null,
      schedule: { type: "daily", time: "20:00" },
    });
    await updateTask("task-2", {
      title: "阅读",
      prompt: null,
      schedule: { type: "daily", time: "21:00" },
      status: "active",
      expectedVersion: 1,
    });
    await deleteTask("task-2");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/tasks",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/tasks",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/tasks/task-2",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/tasks/task-2",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("preserves the API error code for conflict handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { error: { code: "VERSION_CONFLICT", message: "Task changed." } },
          { status: 409 },
        ),
      ),
    );

    await expect(listTasks()).rejects.toMatchObject({
      name: "TaskClientError",
      code: "VERSION_CONFLICT",
      status: 409,
    } satisfies Partial<TaskClientError>);
  });
});
