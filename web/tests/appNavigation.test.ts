import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appHref,
  configureAppNavigation,
  currentAppSearchParams,
} from "@/lib/platform/appNavigation";

afterEach(() => {
  configureAppNavigation("path");
  vi.unstubAllGlobals();
});

describe("shared app navigation", () => {
  it("uses normal paths on the web and hash routes in a local bundle", () => {
    expect(appHref("/tasks?task=1")).toBe("/tasks?task=1");
    configureAppNavigation("hash");
    expect(appHref("/tasks?task=1")).toBe("#/tasks?task=1");
  });

  it("reads deep-link query parameters from a mobile hash route", () => {
    configureAppNavigation("hash");
    const location = {
      search: "",
      hash: "#/tasks?task=task-1",
    } as Location;

    expect(currentAppSearchParams(location).get("task")).toBe("task-1");
  });
});
