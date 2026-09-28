import { apiFetch } from "@/lib/api/clientRuntime";

export type PluginKind = "skill" | "tool" | "activity" | "connector";
export type PluginInstallationStatus = "enabled" | "disabled" | "incompatible";

export type PluginCatalogItem = {
  manifest: {
    schemaVersion: "1";
    id: string;
    name: string;
    description: string;
    version: string;
    pluginApiVersion: string;
    kind: PluginKind;
    source: "first-party";
    availability: "foundation" | "available";
    contributions: {
      skills: string[];
      tools: string[];
      activities: string[];
      backgroundJobs: string[];
    };
    requestedCapabilities: string[];
  };
  compatibility:
    | { status: "compatible"; hostApiVersion: string; reason: null }
    | { status: "incompatible"; hostApiVersion: string; reason: string };
  installation: {
    status: PluginInstallationStatus;
    enabled: boolean;
    installedVersion: string | null;
    version: number;
    updateAvailable: boolean;
    updatedAt: string | null;
  };
};

export class PluginClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PluginClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PluginClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  return (body as { data: T }).data;
}

export function listPlugins(): Promise<PluginCatalogItem[]> {
  return request("/api/v1/plugins");
}

export function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
  expectedVersion: number,
): Promise<PluginCatalogItem> {
  return request(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/${enabled ? "enable" : "disable"}`,
    {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    },
  );
}
