import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type {
  ExportResult,
  FileExportAdapter,
  PromptExportArtifact,
} from "@/lib/platform/capabilities";

type BrowserAnchor = {
  href: string;
  download: string;
  rel: string;
  click(): void;
  remove(): void;
};

type BrowserExportEnvironment = {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createAnchor(): BrowserAnchor;
  appendAnchor(anchor: BrowserAnchor): void;
};

type FilesystemPort = {
  writeFile(options: {
    path: string;
    data: string;
    directory: Directory;
    encoding: Encoding;
    recursive: boolean;
  }): Promise<unknown>;
  getUri(options: { path: string; directory: Directory }): Promise<{ uri: string }>;
};

type SharePort = {
  share(options: {
    title: string;
    text: string;
    files: string[];
    dialogTitle: string;
  }): Promise<unknown>;
};

function validateArtifact(artifact: PromptExportArtifact): void {
  if (!artifact.filename || /[\\/]/.test(artifact.filename)) {
    throw new Error("导出文件名无效");
  }
  if (!artifact.content) throw new Error("导出内容为空");
}

function defaultBrowserEnvironment(): BrowserExportEnvironment {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
  };
}

export function createBrowserFileExportAdapter(
  environment: BrowserExportEnvironment = defaultBrowserEnvironment(),
): FileExportAdapter {
  return {
    async export(artifact): Promise<ExportResult> {
      validateArtifact(artifact);
      const blob = new Blob([artifact.content], {
        type: `${artifact.mediaType};charset=utf-8`,
      });
      const url = environment.createObjectURL(blob);
      const anchor = environment.createAnchor();
      try {
        anchor.href = url;
        anchor.download = artifact.filename;
        anchor.rel = "noopener";
        environment.appendAnchor(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        environment.revokeObjectURL(url);
      }
      return { method: "download" };
    },
  };
}

export function createCapacitorFileExportAdapter(
  filesystem: FilesystemPort = Filesystem,
  share: SharePort = Share,
): FileExportAdapter {
  return {
    async export(artifact): Promise<ExportResult> {
      validateArtifact(artifact);
      const path = `prompt-exports/${artifact.filename}`;
      await filesystem.writeFile({
        path,
        data: artifact.content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      const { uri } = await filesystem.getUri({
        path,
        directory: Directory.Cache,
      });
      await share.share({
        title: "AI 学习伴侣 Prompt 导出",
        text: "Prompt 文件不包含 API Key；分享前请确认是否包含个人记忆。",
        files: [uri],
        dialogTitle: "分享 Prompt 文件",
      });
      return { method: "share", uri };
    },
  };
}

export function getFileExportAdapter(): FileExportAdapter {
  return Capacitor.isNativePlatform()
    ? createCapacitorFileExportAdapter()
    : createBrowserFileExportAdapter();
}
