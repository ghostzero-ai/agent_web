import { and, asc, eq, like, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { pluginInstallations, pluginStorageEntries } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export const PLUGIN_STORAGE_MAX_ENTRIES = 250;
export const PLUGIN_STORAGE_MAX_VALUE_BYTES = 65_536;
export const PLUGIN_STORAGE_MAX_TOTAL_BYTES = 1_048_576;
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/;

export type PluginStorageEntry = {
  key: string;
  value: unknown;
  byteSize: number;
  version: number;
  updatedAt: Date;
};

export class PluginStorageRepositoryError extends Error {
  constructor(
    readonly code:
      | "PLUGIN_STORAGE_INVALID_KEY"
      | "PLUGIN_STORAGE_INVALID_VALUE"
      | "PLUGIN_STORAGE_VALUE_TOO_LARGE"
      | "PLUGIN_STORAGE_ENTRY_LIMIT"
      | "PLUGIN_STORAGE_TOTAL_LIMIT"
      | "PLUGIN_STORAGE_SCOPE_MISSING"
      | "PLUGIN_STORAGE_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "PluginStorageRepositoryError";
  }
}

export interface PluginStorageRepositoryPort {
  get(pluginId: string, key: string): Promise<PluginStorageEntry | null>;
  list(pluginId: string, prefix: string, limit: number): Promise<PluginStorageEntry[]>;
  set(input: {
    pluginId: string;
    key: string;
    value: unknown;
    expectedVersion: number;
    now: Date;
  }): Promise<PluginStorageEntry>;
  delete(input: {
    pluginId: string;
    key: string;
    expectedVersion: number;
  }): Promise<boolean>;
}

function validateKey(key: string): string {
  if (!KEY_PATTERN.test(key)) {
    throw new PluginStorageRepositoryError(
      "PLUGIN_STORAGE_INVALID_KEY",
      "Storage keys must be 1-120 safe characters.",
    );
  }
  return key;
}

function valueSize(value: unknown): number {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = undefined;
  }
  if (serialized === undefined) {
    throw new PluginStorageRepositoryError(
      "PLUGIN_STORAGE_INVALID_VALUE",
      "Storage values must be JSON serializable.",
    );
  }
  const size = Buffer.byteLength(serialized, "utf8");
  if (size < 1 || size > PLUGIN_STORAGE_MAX_VALUE_BYTES) {
    throw new PluginStorageRepositoryError(
      "PLUGIN_STORAGE_VALUE_TOO_LARGE",
      `Storage values may use at most ${PLUGIN_STORAGE_MAX_VALUE_BYTES} bytes.`,
    );
  }
  return size;
}

function entry(row: typeof pluginStorageEntries.$inferSelect): PluginStorageEntry {
  return {
    key: row.key,
    value: row.value,
    byteSize: row.byteSize,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export class PluginStorageRepository<TQueryResult extends PgQueryResultHKT>
  implements PluginStorageRepositoryPort
{
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async get(pluginId: string, key: string): Promise<PluginStorageEntry | null> {
    validateKey(key);
    const [row] = await this.database
      .select()
      .from(pluginStorageEntries)
      .where(and(
        eq(pluginStorageEntries.userId, LOCAL_USER_ID),
        eq(pluginStorageEntries.pluginId, pluginId),
        eq(pluginStorageEntries.key, key),
      ))
      .limit(1);
    return row ? entry(row) : null;
  }

  async list(
    pluginId: string,
    prefix: string,
    limit: number,
  ): Promise<PluginStorageEntry[]> {
    if (prefix && !KEY_PATTERN.test(prefix)) {
      throw new PluginStorageRepositoryError(
        "PLUGIN_STORAGE_INVALID_KEY",
        "Storage prefixes must use safe key characters.",
      );
    }
    const escapedPrefix = prefix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const rows = await this.database
      .select()
      .from(pluginStorageEntries)
      .where(and(
        eq(pluginStorageEntries.userId, LOCAL_USER_ID),
        eq(pluginStorageEntries.pluginId, pluginId),
        like(pluginStorageEntries.key, `${escapedPrefix}%`),
      ))
      .orderBy(asc(pluginStorageEntries.key))
      .limit(Math.min(100, Math.max(1, limit)));
    return rows.map(entry);
  }

  async set(input: {
    pluginId: string;
    key: string;
    value: unknown;
    expectedVersion: number;
    now: Date;
  }): Promise<PluginStorageEntry> {
    validateKey(input.key);
    const byteSize = valueSize(input.value);
    return this.database.transaction(async (transaction) => {
      const [scope] = await transaction
        .select({ id: pluginInstallations.id })
        .from(pluginInstallations)
        .where(and(
          eq(pluginInstallations.userId, LOCAL_USER_ID),
          eq(pluginInstallations.pluginId, input.pluginId),
        ))
        .for("update")
        .limit(1);
      if (!scope) {
        throw new PluginStorageRepositoryError(
          "PLUGIN_STORAGE_SCOPE_MISSING",
          "The plugin storage scope does not exist.",
        );
      }
      const [current] = await transaction
        .select()
        .from(pluginStorageEntries)
        .where(and(
          eq(pluginStorageEntries.userId, LOCAL_USER_ID),
          eq(pluginStorageEntries.pluginId, input.pluginId),
          eq(pluginStorageEntries.key, input.key),
        ))
        .for("update")
        .limit(1);
      const [usage] = await transaction
        .select({
          count: sql<number>`count(*)::int`,
          bytes: sql<number>`coalesce(sum(${pluginStorageEntries.byteSize}), 0)::int`,
        })
        .from(pluginStorageEntries)
        .where(and(
          eq(pluginStorageEntries.userId, LOCAL_USER_ID),
          eq(pluginStorageEntries.pluginId, input.pluginId),
        ));
      if (!current && usage.count >= PLUGIN_STORAGE_MAX_ENTRIES) {
        throw new PluginStorageRepositoryError(
          "PLUGIN_STORAGE_ENTRY_LIMIT",
          "The plugin reached its storage entry limit.",
        );
      }
      const projectedBytes = usage.bytes - (current?.byteSize ?? 0) + byteSize;
      if (projectedBytes > PLUGIN_STORAGE_MAX_TOTAL_BYTES) {
        throw new PluginStorageRepositoryError(
          "PLUGIN_STORAGE_TOTAL_LIMIT",
          "The plugin reached its isolated storage size limit.",
        );
      }
      let saved: typeof pluginStorageEntries.$inferSelect | undefined;
      if (input.expectedVersion === 0) {
        if (current) {
          throw new PluginStorageRepositoryError(
            "PLUGIN_STORAGE_VERSION_CONFLICT",
            "The storage entry changed before it could be written.",
          );
        }
        [saved] = await transaction
          .insert(pluginStorageEntries)
          .values({
            userId: LOCAL_USER_ID,
            pluginId: input.pluginId,
            key: input.key,
            value: input.value,
            byteSize,
            updatedAt: input.now,
          })
          .onConflictDoNothing({
            target: [
              pluginStorageEntries.userId,
              pluginStorageEntries.pluginId,
              pluginStorageEntries.key,
            ],
          })
          .returning();
      } else {
        [saved] = await transaction
          .update(pluginStorageEntries)
          .set({
            value: input.value,
            byteSize,
            version: sql`${pluginStorageEntries.version} + 1`,
            updatedAt: input.now,
          })
          .where(and(
            eq(pluginStorageEntries.userId, LOCAL_USER_ID),
            eq(pluginStorageEntries.pluginId, input.pluginId),
            eq(pluginStorageEntries.key, input.key),
            eq(pluginStorageEntries.version, input.expectedVersion),
          ))
          .returning();
      }
      if (!saved) {
        throw new PluginStorageRepositoryError(
          "PLUGIN_STORAGE_VERSION_CONFLICT",
          "The storage entry changed before it could be written.",
        );
      }
      return entry(saved);
    });
  }

  async delete(input: {
    pluginId: string;
    key: string;
    expectedVersion: number;
  }): Promise<boolean> {
    validateKey(input.key);
    return this.database.transaction(async (transaction) => {
      const [scope] = await transaction
        .select({ id: pluginInstallations.id })
        .from(pluginInstallations)
        .where(and(
          eq(pluginInstallations.userId, LOCAL_USER_ID),
          eq(pluginInstallations.pluginId, input.pluginId),
        ))
        .for("update")
        .limit(1);
      if (!scope) {
        throw new PluginStorageRepositoryError(
          "PLUGIN_STORAGE_SCOPE_MISSING",
          "The plugin storage scope does not exist.",
        );
      }
      const deleted = await transaction
        .delete(pluginStorageEntries)
        .where(and(
          eq(pluginStorageEntries.userId, LOCAL_USER_ID),
          eq(pluginStorageEntries.pluginId, input.pluginId),
          eq(pluginStorageEntries.key, input.key),
          eq(pluginStorageEntries.version, input.expectedVersion),
        ))
        .returning({ id: pluginStorageEntries.id });
      if (deleted.length === 0) {
        throw new PluginStorageRepositoryError(
          "PLUGIN_STORAGE_VERSION_CONFLICT",
          "The storage entry changed before it could be deleted.",
        );
      }
      return true;
    });
  }
}

export function createPluginStorageRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new PluginStorageRepository(database);
}
