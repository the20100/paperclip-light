import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  companies,
  fileReservations,
  heartbeatRuns,
  humanActions,
  projectMemoryItems,
  repositoryOperations,
} from "@paperclipai/db";
import { lightCompanyConfigSchema } from "@paperclipai/shared";
import { getRunLogStore, type RunLogStore } from "./run-log-store.js";

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "interrupted", "failed", "cancelled", "timed_out"]);
const STALE_REPOSITORY_OPERATION_MS = 60 * 60 * 1_000;
const RUN_LOG_PRUNE_BATCH_SIZE = 100;

export interface LightMaintenanceSweepResult {
  companiesChecked: number;
  reservationsOrphaned: number;
  repositoryOperationsFailed: number;
  humanActionsExpired: number;
  memoryItemsExpired: number;
  runLogsDeleted: number;
  runLogDeleteFailures: number;
  providerProfilesMarkedStale: number;
}

export function lightMaintenanceService(
  db: Db,
  options: { runLogStore?: RunLogStore; now?: () => Date } = {},
) {
  const runLogStore = options.runLogStore ?? getRunLogStore();
  const now = options.now ?? (() => new Date());
  const lastSweepAtByCompany = new Map<string, number>();

  async function pruneRunLogs(companyId: string, retentionDays: number, at: Date) {
    if (!runLogStore.delete) return { deleted: 0, failed: 0 };
    const cutoff = new Date(at.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
    const candidates = await db
      .select({
        id: heartbeatRuns.id,
        status: heartbeatRuns.status,
        logStore: heartbeatRuns.logStore,
        logRef: heartbeatRuns.logRef,
      })
      .from(heartbeatRuns)
      .where(and(
        eq(heartbeatRuns.companyId, companyId),
        isNotNull(heartbeatRuns.logRef),
        isNotNull(heartbeatRuns.finishedAt),
        lt(heartbeatRuns.finishedAt, cutoff),
      ))
      .limit(RUN_LOG_PRUNE_BATCH_SIZE);

    let deleted = 0;
    let failed = 0;
    for (const candidate of candidates) {
      if (
        !candidate.logRef
        || candidate.logStore !== "local_file"
        || !TERMINAL_RUN_STATUSES.has(candidate.status)
      ) continue;
      try {
        await runLogStore.delete({
          store: "local_file",
          logRef: candidate.logRef,
        });
        const cleared = await db
          .update(heartbeatRuns)
          .set({
            logStore: null,
            logRef: null,
            logBytes: null,
            logSha256: null,
            logCompressed: false,
            updatedAt: at,
          })
          .where(and(eq(heartbeatRuns.id, candidate.id), eq(heartbeatRuns.logRef, candidate.logRef)))
          .returning({ id: heartbeatRuns.id });
        if (cleared.length > 0) deleted += 1;
      } catch {
        failed += 1;
      }
    }
    return { deleted, failed };
  }

  return {
    sweep: async (): Promise<LightMaintenanceSweepResult> => {
      const at = now();
      const lightCompanies = await db
        .select({ id: companies.id, lightConfig: companies.lightConfig })
        .from(companies)
        .where(eq(companies.executionProfile, "light"));
      const result: LightMaintenanceSweepResult = {
        companiesChecked: 0,
        reservationsOrphaned: 0,
        repositoryOperationsFailed: 0,
        humanActionsExpired: 0,
        memoryItemsExpired: 0,
        runLogsDeleted: 0,
        runLogDeleteFailures: 0,
        providerProfilesMarkedStale: 0,
      };

      for (const company of lightCompanies) {
        const parsed = lightCompanyConfigSchema.safeParse(company.lightConfig ?? {});
        if (!parsed.success) continue;
        const lastSweepAt = lastSweepAtByCompany.get(company.id) ?? 0;
        if (at.getTime() - lastSweepAt < parsed.data.deterministicHealthCheckSeconds * 1_000) continue;
        lastSweepAtByCompany.set(company.id, at.getTime());
        result.companiesChecked += 1;

        const modelRegistry = parsed.data.modelRegistry.map((profile) => {
          const checkedAt = profile.lastCheckedAt?.getTime() ?? 0;
          const stale = checkedAt > 0
            && at.getTime() - checkedAt > parsed.data.providerHealthTtlSeconds * 1_000
            && profile.health !== "unknown";
          if (!stale) return profile;
          result.providerProfilesMarkedStale += 1;
          return {
            ...profile,
            health: "unknown" as const,
            healthReason: "Deterministic health evidence expired; routing will re-evaluate without hard-blocking this model.",
          };
        });
        if (modelRegistry.some((profile, index) => profile !== parsed.data.modelRegistry[index])) {
          await db.update(companies).set({
            lightConfig: { ...parsed.data, modelRegistry },
            updatedAt: at,
          }).where(eq(companies.id, company.id));
        }

        const orphaned = await db
          .update(fileReservations)
          .set({ status: "orphaned", updatedAt: at })
          .where(and(
            eq(fileReservations.companyId, company.id),
            eq(fileReservations.status, "active"),
            lt(fileReservations.leaseExpiresAt, at),
          ))
          .returning({ id: fileReservations.id });
        result.reservationsOrphaned += orphaned.length;

        const staleOperationCutoff = new Date(at.getTime() - STALE_REPOSITORY_OPERATION_MS);
        const failedOperations = await db
          .update(repositoryOperations)
          .set({
            status: "failed",
            error: "Repository broker operation exceeded the deterministic one-hour safety limit.",
            finishedAt: at,
            updatedAt: at,
          })
          .where(and(
            eq(repositoryOperations.companyId, company.id),
            eq(repositoryOperations.status, "running"),
            lt(repositoryOperations.startedAt, staleOperationCutoff),
          ))
          .returning({ id: repositoryOperations.id });
        result.repositoryOperationsFailed += failedOperations.length;

        const expiredActions = await db
          .update(humanActions)
          .set({ status: "expired", completedAt: at, updatedAt: at })
          .where(and(
            eq(humanActions.companyId, company.id),
            inArray(humanActions.status, ["pending", "approved"]),
            lt(humanActions.expiresAt, at),
          ))
          .returning({ id: humanActions.id });
        result.humanActionsExpired += expiredActions.length;

        const expiredMemory = await db
          .update(projectMemoryItems)
          .set({ status: "expired", updatedAt: at })
          .where(and(
            eq(projectMemoryItems.companyId, company.id),
            eq(projectMemoryItems.status, "active"),
            lt(projectMemoryItems.expiresAt, at),
          ))
          .returning({ id: projectMemoryItems.id });
        result.memoryItemsExpired += expiredMemory.length;

        const logs = await pruneRunLogs(company.id, parsed.data.logRetentionDays, at);
        result.runLogsDeleted += logs.deleted;
        result.runLogDeleteFailures += logs.failed;
      }
      return result;
    },
  };
}
