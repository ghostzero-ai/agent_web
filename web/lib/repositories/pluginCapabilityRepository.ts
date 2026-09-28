import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  pluginCapabilityAudit,
  pluginCapabilityGrants,
  pluginInstallations,
  pluginQuotaUsage,
  users,
  type PluginCapabilityAuditOutcome,
  type PluginCapabilityAuditRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import {
  getPluginCapabilityDefinition,
  type PluginCapabilityId,
} from "@/lib/plugins/capabilityCatalog";
import type { PluginRegistryPort } from "@/lib/plugins/pluginRegistry";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type PluginExecutionKind = "foreground" | "background" | "authorization";

export type PluginCapabilityView = {
  id: PluginCapabilityId;
  name: string;
  description: string;
  risk: "compute" | "private-storage" | "core-write";
  adapterStatus: "available" | "planned";
  grant: {
    status: "granted" | "revoked";
    effective: boolean;
    version: number;
    reviewedPluginVersion: string | null;
    requiresReview: boolean;
  };
  quota: {
    used: number;
    limit: number;
    remaining: number;
    resetsAt: Date;
  };
};

export type PluginCapabilityDashboard = {
  pluginId: string;
  pluginVersion: string;
  pluginEnabled: boolean;
  capabilities: PluginCapabilityView[];
};

export type PluginCapabilityAuditView = Pick<
  PluginCapabilityAuditRecord,
  | "id"
  | "requestId"
  | "pluginId"
  | "capabilityId"
  | "operation"
  | "execution"
  | "runId"
  | "outcome"
  | "errorCode"
  | "units"
  | "durationMs"
  | "createdAt"
  | "completedAt"
>;

export type PluginCapabilityErrorCode =
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_DISABLED"
  | "PLUGIN_INCOMPATIBLE"
  | "PLUGIN_UPDATE_REVIEW_REQUIRED"
  | "CAPABILITY_NOT_DECLARED"
  | "CAPABILITY_NOT_GRANTED"
  | "CAPABILITY_REVIEW_REQUIRED"
  | "CAPABILITY_QUOTA_EXCEEDED"
  | "CAPABILITY_UNITS_INVALID"
  | "CAPABILITY_GRANT_VERSION_CONFLICT";

export class PluginCapabilityRepositoryError extends Error {
  constructor(
    readonly code: PluginCapabilityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PluginCapabilityRepositoryError";
  }
}

export interface PluginCapabilityRepositoryPort {
  getDashboard(pluginId: string, now: Date): Promise<PluginCapabilityDashboard>;
  setGrant(input: {
    pluginId: string;
    capabilityId: PluginCapabilityId;
    granted: boolean;
    expectedVersion: number;
    now: Date;
  }): Promise<PluginCapabilityDashboard>;
  reserveInvocation(input: {
    pluginId: string;
    capabilityId: PluginCapabilityId;
    units: number;
    now: Date;
  }): Promise<{ used: number; limit: number; remaining: number; resetsAt: Date }>;
  startAudit(input: {
    requestId: string;
    pluginId: string;
    capabilityId: PluginCapabilityId;
    operation: string;
    execution: Exclude<PluginExecutionKind, "authorization">;
    runId: string | null;
    units: number;
    now: Date;
  }): Promise<string>;
  finishAudit(input: {
    auditId: string;
    outcome: Extract<PluginCapabilityAuditOutcome, "succeeded" | "failed">;
    errorCode: string | null;
    durationMs: number;
    now: Date;
  }): Promise<void>;
  recordDeniedAudit(input: {
    requestId: string;
    pluginId: string;
    capabilityId: PluginCapabilityId;
    operation: string;
    execution: Exclude<PluginExecutionKind, "authorization">;
    runId: string | null;
    units: number;
    errorCode: string;
    durationMs: number;
    now: Date;
  }): Promise<void>;
  listAudit(pluginId: string, limit: number): Promise<PluginCapabilityAuditView[]>;
}

function utcDay(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export class PluginCapabilityRepository<TQueryResult extends PgQueryResultHKT>
  implements PluginCapabilityRepositoryPort
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

  private plugin(pluginId: string) {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      throw new PluginCapabilityRepositoryError(
        "PLUGIN_NOT_FOUND",
        "The requested first-party plugin does not exist.",
      );
    }
    return plugin;
  }

  private declaredCapability(pluginId: string, capabilityId: PluginCapabilityId) {
    const plugin = this.plugin(pluginId);
    if (!plugin.manifest.requestedCapabilities.includes(capabilityId)) {
      throw new PluginCapabilityRepositoryError(
        "CAPABILITY_NOT_DECLARED",
        "The plugin did not declare this capability in its manifest.",
      );
    }
    return plugin;
  }

  async getDashboard(
    pluginId: string,
    now: Date,
  ): Promise<PluginCapabilityDashboard> {
    await this.ensureUser();
    const plugin = this.plugin(pluginId);
    const { start, end } = utcDay(now);
    const [installation] = await this.database
      .select()
      .from(pluginInstallations)
      .where(and(
        eq(pluginInstallations.userId, LOCAL_USER_ID),
        eq(pluginInstallations.pluginId, pluginId),
      ))
      .limit(1);
    const grants = await this.database
      .select()
      .from(pluginCapabilityGrants)
      .where(and(
        eq(pluginCapabilityGrants.userId, LOCAL_USER_ID),
        eq(pluginCapabilityGrants.pluginId, pluginId),
      ));
    const usage = await this.database
      .select()
      .from(pluginQuotaUsage)
      .where(and(
        eq(pluginQuotaUsage.userId, LOCAL_USER_ID),
        eq(pluginQuotaUsage.pluginId, pluginId),
        eq(pluginQuotaUsage.periodStart, start),
      ));
    const grantsById = new Map(grants.map((grant) => [grant.capabilityId, grant]));
    const usageById = new Map(usage.map((item) => [item.capabilityId, item.usedUnits]));
    const pluginEnabled =
      plugin.compatibility.status === "compatible" &&
      installation?.status === "enabled" &&
      installation.installedVersion === plugin.manifest.version;
    return {
      pluginId,
      pluginVersion: plugin.manifest.version,
      pluginEnabled,
      capabilities: plugin.manifest.requestedCapabilities.map((capabilityId) => {
        const definition = getPluginCapabilityDefinition(capabilityId);
        const grant = grantsById.get(capabilityId);
        const used = usageById.get(capabilityId) ?? 0;
        const requiresReview = Boolean(
          grant?.status === "granted" &&
            grant.pluginVersion !== plugin.manifest.version,
        );
        return {
          ...definition,
          grant: {
            status: grant?.status ?? "revoked",
            effective: Boolean(
              pluginEnabled &&
                grant?.status === "granted" &&
                !requiresReview,
            ),
            version: grant?.version ?? 0,
            reviewedPluginVersion: grant?.pluginVersion ?? null,
            requiresReview,
          },
          quota: {
            used,
            limit: definition.dailyLimit,
            remaining: Math.max(0, definition.dailyLimit - used),
            resetsAt: end,
          },
        };
      }),
    };
  }

  async setGrant(input: {
    pluginId: string;
    capabilityId: PluginCapabilityId;
    granted: boolean;
    expectedVersion: number;
    now: Date;
  }): Promise<PluginCapabilityDashboard> {
    const plugin = this.declaredCapability(input.pluginId, input.capabilityId);
    if (plugin.compatibility.status === "incompatible") {
      throw new PluginCapabilityRepositoryError(
        "PLUGIN_INCOMPATIBLE",
        plugin.compatibility.reason,
      );
    }
    await this.database.transaction(async (transaction) => {
      const [installation] = await transaction
        .select()
        .from(pluginInstallations)
        .where(and(
          eq(pluginInstallations.userId, LOCAL_USER_ID),
          eq(pluginInstallations.pluginId, input.pluginId),
        ))
        .for("update")
        .limit(1);
      if (!installation) {
        throw new PluginCapabilityRepositoryError(
          "PLUGIN_DISABLED",
          "Enable the plugin before changing its capability grants.",
        );
      }
      if (input.granted && installation.status !== "enabled") {
        throw new PluginCapabilityRepositoryError(
          "PLUGIN_DISABLED",
          "Enable the plugin before granting a capability.",
        );
      }
      if (
        input.granted &&
        installation.installedVersion !== plugin.manifest.version
      ) {
        throw new PluginCapabilityRepositoryError(
          "PLUGIN_UPDATE_REVIEW_REQUIRED",
          "Review and re-enable the updated plugin before granting capabilities.",
        );
      }
      const status = input.granted ? "granted" : "revoked";
      let changed: { id: string } | undefined;
      if (input.expectedVersion === 0) {
        [changed] = await transaction
          .insert(pluginCapabilityGrants)
          .values({
            userId: LOCAL_USER_ID,
            pluginId: input.pluginId,
            capabilityId: input.capabilityId,
            pluginVersion: plugin.manifest.version,
            status,
            updatedAt: input.now,
          })
          .onConflictDoNothing({
            target: [
              pluginCapabilityGrants.userId,
              pluginCapabilityGrants.pluginId,
              pluginCapabilityGrants.capabilityId,
            ],
          })
          .returning({ id: pluginCapabilityGrants.id });
      } else {
        [changed] = await transaction
          .update(pluginCapabilityGrants)
          .set({
            pluginVersion: plugin.manifest.version,
            status,
            version: sql`${pluginCapabilityGrants.version} + 1`,
            updatedAt: input.now,
          })
          .where(and(
            eq(pluginCapabilityGrants.userId, LOCAL_USER_ID),
            eq(pluginCapabilityGrants.pluginId, input.pluginId),
            eq(pluginCapabilityGrants.capabilityId, input.capabilityId),
            eq(pluginCapabilityGrants.version, input.expectedVersion),
          ))
          .returning({ id: pluginCapabilityGrants.id });
      }
      if (!changed) {
        throw new PluginCapabilityRepositoryError(
          "CAPABILITY_GRANT_VERSION_CONFLICT",
          "Capability grants changed in another client.",
        );
      }
      await transaction.insert(pluginCapabilityAudit).values({
        requestId: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        pluginId: input.pluginId,
        capabilityId: input.capabilityId,
        operation: input.granted ? "authorization.grant" : "authorization.revoke",
        execution: "authorization",
        outcome: "succeeded",
        units: 0,
        createdAt: input.now,
        completedAt: input.now,
      });
    });
    return this.getDashboard(input.pluginId, input.now);
  }

  async reserveInvocation(input: {
    pluginId: string;
    capabilityId: PluginCapabilityId;
    units: number;
    now: Date;
  }): Promise<{ used: number; limit: number; remaining: number; resetsAt: Date }> {
    if (!Number.isInteger(input.units) || input.units < 1 || input.units > 1_000) {
      throw new PluginCapabilityRepositoryError(
        "CAPABILITY_UNITS_INVALID",
        "Capability units must be an integer between 1 and 1000.",
      );
    }
    const plugin = this.declaredCapability(input.pluginId, input.capabilityId);
    if (plugin.compatibility.status === "incompatible") {
      throw new PluginCapabilityRepositoryError(
        "PLUGIN_INCOMPATIBLE",
        plugin.compatibility.reason,
      );
    }
    const definition = getPluginCapabilityDefinition(input.capabilityId);
    const { start, end } = utcDay(input.now);
    return this.database.transaction(async (transaction) => {
      const [installation] = await transaction
        .select()
        .from(pluginInstallations)
        .where(and(
          eq(pluginInstallations.userId, LOCAL_USER_ID),
          eq(pluginInstallations.pluginId, input.pluginId),
        ))
        .for("update")
        .limit(1);
      if (installation?.status !== "enabled") {
        throw new PluginCapabilityRepositoryError(
          "PLUGIN_DISABLED",
          "The plugin is disabled.",
        );
      }
      if (installation.installedVersion !== plugin.manifest.version) {
        throw new PluginCapabilityRepositoryError(
          "PLUGIN_UPDATE_REVIEW_REQUIRED",
          "The plugin version changed and must be reviewed before use.",
        );
      }
      const [grant] = await transaction
        .select()
        .from(pluginCapabilityGrants)
        .where(and(
          eq(pluginCapabilityGrants.userId, LOCAL_USER_ID),
          eq(pluginCapabilityGrants.pluginId, input.pluginId),
          eq(pluginCapabilityGrants.capabilityId, input.capabilityId),
        ))
        .for("update")
        .limit(1);
      if (grant?.status !== "granted") {
        throw new PluginCapabilityRepositoryError(
          "CAPABILITY_NOT_GRANTED",
          "The capability has not been granted by the user.",
        );
      }
      if (grant.pluginVersion !== plugin.manifest.version) {
        throw new PluginCapabilityRepositoryError(
          "CAPABILITY_REVIEW_REQUIRED",
          "The plugin changed version and this capability must be reviewed again.",
        );
      }
      await transaction
        .insert(pluginQuotaUsage)
        .values({
          userId: LOCAL_USER_ID,
          pluginId: input.pluginId,
          capabilityId: input.capabilityId,
          periodStart: start,
          usedUnits: 0,
          updatedAt: input.now,
        })
        .onConflictDoNothing({
          target: [
            pluginQuotaUsage.userId,
            pluginQuotaUsage.pluginId,
            pluginQuotaUsage.capabilityId,
            pluginQuotaUsage.periodStart,
          ],
        });
      const [usage] = await transaction
        .select()
        .from(pluginQuotaUsage)
        .where(and(
          eq(pluginQuotaUsage.userId, LOCAL_USER_ID),
          eq(pluginQuotaUsage.pluginId, input.pluginId),
          eq(pluginQuotaUsage.capabilityId, input.capabilityId),
          eq(pluginQuotaUsage.periodStart, start),
        ))
        .for("update")
        .limit(1);
      if (!usage || usage.usedUnits + input.units > definition.dailyLimit) {
        throw new PluginCapabilityRepositoryError(
          "CAPABILITY_QUOTA_EXCEEDED",
          "The plugin reached this capability's daily quota.",
        );
      }
      const used = usage.usedUnits + input.units;
      await transaction
        .update(pluginQuotaUsage)
        .set({ usedUnits: used, updatedAt: input.now })
        .where(eq(pluginQuotaUsage.id, usage.id));
      return {
        used,
        limit: definition.dailyLimit,
        remaining: definition.dailyLimit - used,
        resetsAt: end,
      };
    });
  }

  async startAudit(input: {
    requestId: string;
    pluginId: string;
    capabilityId: PluginCapabilityId;
    operation: string;
    execution: "foreground" | "background";
    runId: string | null;
    units: number;
    now: Date;
  }): Promise<string> {
    const [audit] = await this.database
      .insert(pluginCapabilityAudit)
      .values({
        requestId: input.requestId,
        userId: LOCAL_USER_ID,
        pluginId: input.pluginId,
        capabilityId: input.capabilityId,
        operation: input.operation,
        execution: input.execution,
        runId: input.runId,
        outcome: "started",
        units: input.units,
        createdAt: input.now,
      })
      .returning({ id: pluginCapabilityAudit.id });
    return audit.id;
  }

  async finishAudit(input: {
    auditId: string;
    outcome: "succeeded" | "failed";
    errorCode: string | null;
    durationMs: number;
    now: Date;
  }): Promise<void> {
    await this.database
      .update(pluginCapabilityAudit)
      .set({
        outcome: input.outcome,
        errorCode: input.errorCode,
        durationMs: input.durationMs,
        completedAt: input.now,
      })
      .where(and(
        eq(pluginCapabilityAudit.id, input.auditId),
        eq(pluginCapabilityAudit.outcome, "started"),
      ));
  }

  async recordDeniedAudit(input: {
    requestId: string;
    pluginId: string;
    capabilityId: PluginCapabilityId;
    operation: string;
    execution: "foreground" | "background";
    runId: string | null;
    units: number;
    errorCode: string;
    durationMs: number;
    now: Date;
  }): Promise<void> {
    await this.ensureUser();
    await this.database.insert(pluginCapabilityAudit).values({
      requestId: input.requestId,
      userId: LOCAL_USER_ID,
      pluginId: input.pluginId,
      capabilityId: input.capabilityId,
      operation: input.operation,
      execution: input.execution,
      runId: input.runId,
      outcome: "denied",
      errorCode: input.errorCode,
      units: input.units,
      durationMs: input.durationMs,
      createdAt: input.now,
      completedAt: input.now,
    });
  }

  async listAudit(
    pluginId: string,
    limit: number,
  ): Promise<PluginCapabilityAuditView[]> {
    await this.ensureUser();
    this.plugin(pluginId);
    return this.database
      .select({
        id: pluginCapabilityAudit.id,
        requestId: pluginCapabilityAudit.requestId,
        pluginId: pluginCapabilityAudit.pluginId,
        capabilityId: pluginCapabilityAudit.capabilityId,
        operation: pluginCapabilityAudit.operation,
        execution: pluginCapabilityAudit.execution,
        runId: pluginCapabilityAudit.runId,
        outcome: pluginCapabilityAudit.outcome,
        errorCode: pluginCapabilityAudit.errorCode,
        units: pluginCapabilityAudit.units,
        durationMs: pluginCapabilityAudit.durationMs,
        createdAt: pluginCapabilityAudit.createdAt,
        completedAt: pluginCapabilityAudit.completedAt,
      })
      .from(pluginCapabilityAudit)
      .where(and(
        eq(pluginCapabilityAudit.userId, LOCAL_USER_ID),
        eq(pluginCapabilityAudit.pluginId, pluginId),
      ))
      .orderBy(desc(pluginCapabilityAudit.createdAt))
      .limit(Math.min(50, Math.max(1, limit)));
  }
}

export function createPluginCapabilityRepository<
  TQueryResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TQueryResult, typeof schema>,
  registry: PluginRegistryPort,
) {
  return new PluginCapabilityRepository(database, registry);
}
