export type ClientPlatformId =
  | "web"
  | "capacitor-android"
  | "harmony-arkweb";

export type PromptExportArtifact = {
  filename: string;
  mediaType: "application/json" | "text/markdown";
  content: string;
};

export type ExportResult = {
  method: "download" | "share" | "save-picker";
  uri?: string;
};

export interface FileExportAdapter {
  export(artifact: PromptExportArtifact): Promise<ExportResult>;
}

export type SpeechRequest = {
  text: string;
  voiceProfileId: string;
  rate?: number;
  pitch?: number;
};

export interface SpeechOutputAdapter {
  speak(request: SpeechRequest): Promise<void>;
  stop(): Promise<void>;
}

export type LocalReminderSnapshot = {
  taskId: string;
  occurrenceId: string;
  title: string;
  body: string | null;
  scheduledAt: string;
  deepLink: string;
};

export interface LocalNotificationAdapter {
  reconcile(reminders: readonly LocalReminderSnapshot[]): Promise<void>;
  checkPermission(): Promise<"granted" | "denied" | "prompt">;
  requestPermission(): Promise<"granted" | "denied">;
}

export type NativePushRegistration = {
  provider: "huawei-push";
  token: string;
  deviceLabel: string;
};

export interface NativePushAdapter {
  register(): Promise<NativePushRegistration>;
  unregister(): Promise<void>;
}

export type ClientPlatformAdapters = {
  platform: ClientPlatformId;
  files: FileExportAdapter;
  speech: SpeechOutputAdapter;
  localNotifications?: LocalNotificationAdapter;
  nativePush?: NativePushAdapter;
};
