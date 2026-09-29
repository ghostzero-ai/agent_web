import { z } from "zod";

export const PLUGIN_CAPABILITY_IDS = [
  "model.generate",
  "storage.read-write",
  "task.create-draft",
] as const;

export const pluginCapabilityIdSchema = z.enum(PLUGIN_CAPABILITY_IDS);

export type PluginCapabilityId = z.infer<typeof pluginCapabilityIdSchema>;

export type PluginCapabilityRisk = "compute" | "private-storage" | "core-write";

export type PluginCapabilityDefinition = {
  id: PluginCapabilityId;
  name: string;
  description: string;
  risk: PluginCapabilityRisk;
  dailyLimit: number;
  adapterStatus: "available" | "planned";
};

export const PLUGIN_CAPABILITY_CATALOG: Readonly<
  Record<PluginCapabilityId, PluginCapabilityDefinition>
> = {
  "model.generate": {
    id: "model.generate",
    name: "受控模型生成",
    description: "使用宿主模型配置生成学习反馈；插件不能读取 API Key。",
    risk: "compute",
    dailyLimit: 40,
    adapterStatus: "available",
  },
  "storage.read-write": {
    id: "storage.read-write",
    name: "插件隔离存储",
    description: "读写该插件自己的学习数据，不能访问其他插件或核心数据库。",
    risk: "private-storage",
    dailyLimit: 500,
    adapterStatus: "available",
  },
  "task.create-draft": {
    id: "task.create-draft",
    name: "提交任务草稿",
    description: "向核心任务系统提交待用户确认的草稿，不能直接创建提醒。",
    risk: "core-write",
    dailyLimit: 20,
    adapterStatus: "available",
  },
};

export function getPluginCapabilityDefinition(
  capabilityId: PluginCapabilityId,
): PluginCapabilityDefinition {
  return PLUGIN_CAPABILITY_CATALOG[capabilityId];
}
