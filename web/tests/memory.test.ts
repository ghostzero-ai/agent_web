import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMemory,
  clearMemory,
  getMemory,
  summarizeSession,
  type MemoryItem,
} from "../lib/agent/memory";
import {
  installBrowserStorage,
  uninstallBrowserStorage,
} from "./helpers/browserStorage";

beforeEach(() => {
  installBrowserStorage();
});

afterEach(() => {
  vi.useRealTimers();
  uninstallBrowserStorage();
});

describe("browser memory store", () => {
  it("stores memories newest-first", () => {
    const older: MemoryItem = {
      id: "older",
      type: "fact",
      content: "较早内容",
      importance: 3,
      createdAt: 1,
    };
    const newer: MemoryItem = {
      id: "newer",
      type: "user_preference",
      content: "较新内容",
      importance: 7,
      createdAt: 2,
    };

    addMemory(older);
    addMemory(newer);

    expect(getMemory()).toEqual([newer, older]);
  });

  it("deduplicates the same type and content but preserves other types", () => {
    addMemory({
      id: "first",
      type: "fact",
      content: "相同内容",
      importance: 3,
      createdAt: 1,
    });
    addMemory({
      id: "duplicate",
      type: "fact",
      content: "相同内容",
      importance: 9,
      createdAt: 2,
    });
    addMemory({
      id: "other-type",
      type: "summary",
      content: "相同内容",
      importance: 5,
      createdAt: 3,
    });

    expect(getMemory().map((item) => item.id)).toEqual([
      "other-type",
      "first",
    ]);
  });

  it("clears memory to an explicit empty collection", () => {
    addMemory({
      id: "memory",
      type: "fact",
      content: "待清除",
      importance: 3,
      createdAt: 1,
    });

    clearMemory();

    expect(getMemory()).toEqual([]);
    expect(localStorage.getItem("agent_memory_store")).toBe("[]");
  });

  it("recovers safely from malformed storage", () => {
    localStorage.setItem("agent_memory_store", "not-json");

    expect(getMemory()).toEqual([]);
  });

  it("creates a bounded session summary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));

    const summary = summarizeSession("线性代数", "a".repeat(250));

    expect(summary.type).toBe("summary");
    expect(summary.content).toBe(`[线性代数] ${"a".repeat(200)}`);
    expect(summary.importance).toBe(5);
    expect(summary.createdAt).toBe(Date.parse("2026-09-05T00:00:00Z"));
  });
});
