import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  pluginInstallations,
  users,
  type PluginInstallationRecord,
  type PluginInstallationStatus,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import type {
  PluginRegistryPort,
  RegisteredPlugin,
} from "@/lib/plugins/pluginRegistry";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type PluginCatalogItem = RegisteredPlugin & {
  installation: {
    status: PluginInstallationStatus;
    enabled: boolean;
    installedVersion: string | null;
    version: number;
    updateAvailable: boolean;
    updatedAt: Date | null;
  };
};

export class PluginRepositoryError extends Error {
  constructor(
    readonly code:
      | "PLUGIN_NOT_FOUND"
      | "PLUGIN_INCOMPATIBLE"
      | "PLUGIN_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "PluginRepositoryError";
  }
}

export interface PluginRepositoryPort {
  list(): Promise<PluginCatalogItem[]>;
  setEnabled(input: {
    pluginId: string;
    enabled: boolean;
    expectedVersion: number;
    now: Date;
  }): Promise<PluginCatalogItem>;
}

function catalogItem(
  plugin: RegisteredPlugin,
  installation: PluginInstallationRecord | undefined,
): PluginCatalogItem {
  const incompatible = plugin.compatibility.status === "incompatible";
  const enabled = !incompatible && installation?.status === "enabled";
  return {
    ...plugin,
    installation: {
      status: incompatible ? "incompatible" : enabled ? "enabled" : "disabled",
      enabled,
      installedVersion: installation?.installedVersion ?? null,
      version: installation?.version ?? 0,
      updateAvailable: Boolean(
        installation &&
          installation.installedVersion !== plugin.manifest.version,
      ),
      updatedAt: installation?.updatedAt ?? null,
    },
  };
}

export class PluginRepository<TQueryResult extends PgQueryResultHKT>
  implements PluginRepositoryPort
{
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
    private readonly registry: PluginRegistryPort,
  ) {}

  private async ensureUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  async list(): Promise<PluginCatalogItem[]> {
    await this.ensureUser();
    const installations = await this.database
      .select()
      .from(pluginInstallations)
      .where(eq(pluginInstallations.userId, LOCAL_USER_ID));
    const byPluginId = new Map(
      installations.map((installation) => [installation.pluginId, installation]),
    );
    return this.registry
      .list()
      .map((plugin) => catalogItem(plugin, byPluginId.get(plugin.manifest.id)));
  }

  async setEnabled(input: {
    pluginId: string;
    enabled: boolean;
    expectedVersion: number;
    now: Date;
  }): Promise<PluginCatalogItem> {
    const plugin = this.registry.get(input.pluginId);
    if (!plugin) {
      throw new PluginRepositoryError(
        "PLUGIN_NOT_FOUND",
        "The requested first-party plugin does not exist.",
      );
    }
    if (input.enabled && plugin.compatibility.status === "incompatible") {
      throw new PluginRepositoryError(
        "PLUGIN_INCOMPATIBLE",
        plugin.compatibility.reason,
      );
    }
    await this.ensureUser();
    const status: PluginInstallationStatus = input.enabled
      ? "enabled"
      : "disabled";
    let updated: PluginInstallationRecord | undefined;
    if (input.expectedVersion === 0) {
      [updated] = await this.database
        .insert(pluginInstallations)
        .values({
          userId: LOCAL_USER_ID,
          pluginId: plugin.manifest.id,
          installedVersion: plugin.manifest.version,
          status,
          updatedAt: input.now,
        })
        .onConflictDoNothing({
          target: [pluginInstallations.userId, pluginInstallations.pluginId],
        })
        .returning();
    } else {
      [updated] = await this.database
        .update(pluginInstallations)
        .set({
          installedVersion: plugin.manifest.version,
          status,
          version: sql`${pluginInstallations.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(pluginInstallations.userId, LOCAL_USER_ID),
            eq(pluginInstallations.pluginId, plugin.manifest.id),
            eq(pluginInstallations.version, input.expectedVersion),
          ),
        )
        .returning();
    }
    if (!updated) {
      throw new PluginRepositoryError(
        "PLUGIN_VERSION_CONFLICT",
        "Plugin state changed in another client.",
      );
    }
    return catalogItem(plugin, updated);
  }
}

export function createPluginRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
  registry: PluginRegistryPort,
) {
  return new PluginRepository(database, registry);
}
