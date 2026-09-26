import { describe, expect, it, vi } from "vitest";
import { Directory, Encoding } from "@capacitor/filesystem";
import {
  createBrowserFileExportAdapter,
  createCapacitorFileExportAdapter,
} from "@/lib/platform/fileExport";

const artifact = {
  filename: "prompt-test.json",
  mediaType: "application/json" as const,
  content: "{\"safe\":true}\n",
};

describe("FileExportAdapter", () => {
  it("downloads a Blob in the browser and revokes the temporary URL", async () => {
    const anchor = {
      href: "",
      download: "",
      rel: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const createObjectURL = vi.fn(() => "blob:prompt-export");
    const revokeObjectURL = vi.fn();
    const appendAnchor = vi.fn();
    const adapter = createBrowserFileExportAdapter({
      createObjectURL,
      revokeObjectURL,
      createAnchor: () => anchor,
      appendAnchor,
    });

    await expect(adapter.export(artifact)).resolves.toEqual({ method: "download" });
    expect(anchor).toMatchObject({
      href: "blob:prompt-export",
      download: "prompt-test.json",
      rel: "noopener",
    });
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:prompt-export");
  });

  it("writes to Capacitor cache and shares the generated file URI", async () => {
    const filesystem = {
      writeFile: vi.fn().mockResolvedValue({ uri: "ignored" }),
      getUri: vi.fn().mockResolvedValue({ uri: "file:///cache/prompt-test.json" }),
    };
    const share = { share: vi.fn().mockResolvedValue({ activityType: "test" }) };
    const adapter = createCapacitorFileExportAdapter(filesystem, share);

    await expect(adapter.export(artifact)).resolves.toEqual({
      method: "share",
      uri: "file:///cache/prompt-test.json",
    });
    expect(filesystem.writeFile).toHaveBeenCalledWith({
      path: "prompt-exports/prompt-test.json",
      data: artifact.content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    expect(share.share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["file:///cache/prompt-test.json"] }),
    );
  });
});
