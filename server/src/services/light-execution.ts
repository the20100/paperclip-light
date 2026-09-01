import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentWakeupRequests,
  agents,
  fileReservations,
  heartbeatRuns,
  issues,
  projects,
  projectWorkspaces,
  repositoryOperations,
  taskCheckpoints,
} from "@paperclipai/db";
import {
  lightRepositoryPolicySchema,
  type CaptureTaskCheckpointInput,
  type FileReservation,
  type FileReservationConflict,
  type FileReservationResult,
  type LightRepositoryPolicy,
  type ReleaseProjectFilesInput,
  type RenewProjectFilesInput,
  type RepositoryOperation,
  type RepositoryOperationInput,
  type RestoreTaskCheckpointInput,
  type ReserveProjectFilesInput,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";

const ACTIVE_RESERVATION_STATUSES = ["active", "orphaned"] as const;
const RESERVATION_OUTPUT_LIMIT = 64 * 1024;
const REPOSITORY_OPERATION_TIMEOUT_MS = 30 * 60_000;
const STALE_REPOSITORY_OPERATION_MS = 60 * 60_000;

type FileReservationRow = typeof fileReservations.$inferSelect;
type RepositoryOperationRow = typeof repositoryOperations.$inferSelect;

export type LightExecutionActor = {
  actorType: "agent" | "user";
  actorId: string;
  agentId: string | null;
  runId: string | null;
};

function toReservation(row: FileReservationRow): FileReservation {
  return {
    ...row,
    runId: row.runId ?? null,
    blockedByReservationId: row.blockedByReservationId ?? null,
    leaseExpiresAt: row.leaseExpiresAt ?? null,
    lastRenewedAt: row.lastRenewedAt ?? null,
    releasedAt: row.releasedAt ?? null,
    releaseReason: row.releaseReason ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    status: row.status as FileReservation["status"],
  };
}

function toRepositoryOperation(row: RepositoryOperationRow): RepositoryOperation {
  return {
    ...row,
    runId: row.runId ?? null,
    paths: (row.paths as string[] | null) ?? null,
    targetBranch: row.targetBranch ?? null,
    commitSha: row.commitSha ?? null,
    exitCode: row.exitCode ?? null,
    stdoutExcerpt: row.stdoutExcerpt ?? null,
    stderrExcerpt: row.stderrExcerpt ?? null,
    error: row.error ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    kind: row.kind as RepositoryOperation["kind"],
    status: row.status as RepositoryOperation["status"],
  };
}

export function normalizeReservedPath(value: string): string {
  if (value.includes("\0")) throw unprocessable("File paths cannot contain NUL bytes");
  const slashPath = value.trim().replaceAll("\\", "/");
  if (!slashPath || slashPath.startsWith("/") || /^[A-Za-z]:\//.test(slashPath)) {
    throw unprocessable(`File reservation path must be repository-relative: ${value}`);
  }
  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw unprocessable(`File reservation path escapes the repository: ${value}`);
  }
  if (normalized.split("/").some((segment) => segment === ".git")) {
    throw unprocessable("The .git directory is owned by the Paperclip repository broker");
  }
  return normalized;
}

function normalizePathSet(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeReservedPath))].sort();
}

function assertInsideWorkspace(workspaceRoot: string, candidate: string, original: string) {
  const relative = path.relative(workspaceRoot, candidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw unprocessable(`File path resolves outside the project workspace: ${original}`, {
    code: "light_repository_symlink_escape",
  });
}

async function canonicalizeReservedPath(workspaceRoot: string, value: string): Promise<string> {
  const normalized = normalizeReservedPath(value);
  let current = workspaceRoot;
  const remaining = normalized.split("/");
  for (let index = 0; index < remaining.length; index += 1) {
    const segment = remaining[index]!;
    const canonicalParent = await fs.realpath(current).catch(() => current);
    assertInsideWorkspace(workspaceRoot, canonicalParent, value);
    const entries = await fs.readdir(canonicalParent).catch(() => [] as string[]);
    const foldedMatches = entries.filter((entry) => entry.toLocaleLowerCase("en") === segment.toLocaleLowerCase("en"));
    if (foldedMatches.length > 1 && !foldedMatches.includes(segment)) {
      throw conflict(`File path is ambiguous on this filesystem: ${value}`, {
        code: "light_repository_case_ambiguous",
        matches: foldedMatches,
      });
    }
    const chosen = entries.includes(segment) ? segment : foldedMatches[0] ?? segment;
    const next = path.join(canonicalParent, chosen);
    const exists = await fs.lstat(next).then(() => true).catch(() => false);
    if (!exists) {
      current = path.join(canonicalParent, chosen, ...remaining.slice(index + 1));
      break;
    }
    current = await fs.realpath(next).catch(() => next);
    assertInsideWorkspace(workspaceRoot, current, value);
  }
  assertInsideWorkspace(workspaceRoot, current, value);
  return normalizeReservedPath(path.relative(workspaceRoot, current).replaceAll(path.sep, "/"));
}

async function canonicalizePathSet(workspaceRoot: string, values: readonly string[]): Promise<string[]> {
  return [...new Set(await Promise.all(values.map((value) => canonicalizeReservedPath(workspaceRoot, value))))].sort();
}

export function reservedPathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function parseRepositoryPolicy(raw: unknown): LightRepositoryPolicy | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = (raw as { lightRepository?: unknown }).lightRepository;
  const parsed = lightRepositoryPolicySchema.safeParse(candidate);
  return parsed.success && parsed.data.enabled ? parsed.data : null;
}

function branchIsSafe(value: string): boolean {
  return value.length > 0
    && value.length <= 255
    && !value.startsWith("-")
    && !value.startsWith("/")
    && !value.endsWith("/")
    && !value.endsWith(".")
    && !value.includes("..")
    && !value.includes("@{")
    && !/[\s~^:?*\[\\]/.test(value);
}

async function resolveScope(db: Db, projectId: string) {
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .then((rows) => rows[0] ?? null);
  if (!project) throw notFound("Project not found");
  const policy = parseRepositoryPolicy(project.executionWorkspacePolicy);
  if (!policy) {
    throw unprocessable("Paperclip Light shared-repository mode is not enabled for this project", {
      code: "light_repository_disabled",
    });
  }
  const workspaceRows = await db
    .select()
    .from(projectWorkspaces)
    .where(eq(projectWorkspaces.projectId, projectId))
    .orderBy(asc(projectWorkspaces.createdAt));
  const workspace = workspaceRows.find((entry) => entry.isPrimary) ?? workspaceRows[0] ?? null;
  if (!workspace?.cwd) {
    throw unprocessable("The project needs a primary local workspace before Light repository operations can run", {
      code: "light_repository_workspace_missing",
    });
  }
  const canonicalCwd = await fs.realpath(workspace.cwd).catch(() => null);
  if (!canonicalCwd) throw unprocessable("The primary project workspace path is unavailable");
  const gitDir = await fs.stat(path.join(canonicalCwd, ".git")).catch(() => null);
  if (!gitDir) throw unprocessable("The primary project workspace is not a Git checkout");
  return { project, policy, workspace, cwd: canonicalCwd };
}

async function resolveIssueAndAgent(input: {
  db: Db;
  companyId: string;
  projectId: string;
  issueId: string;
  requestedAgentId?: string;
  actor: LightExecutionActor;
}) {
  const issue = await input.db
    .select()
    .from(issues)
    .where(and(eq(issues.id, input.issueId), eq(issues.companyId, input.companyId)))
    .then((rows) => rows[0] ?? null);
  if (!issue || issue.projectId !== input.projectId) throw notFound("Task not found in this project");

  const agentId = input.actor.actorType === "agent"
    ? input.actor.agentId
    : input.requestedAgentId ?? issue.assigneeAgentId;
  if (!agentId) throw unprocessable("A task agent is required for repository ownership");
  if (input.actor.actorType === "agent" && input.requestedAgentId && input.requestedAgentId !== agentId) {
    throw forbidden("Agents cannot reserve files on behalf of another agent");
  }
  if (input.actor.actorType === "agent" && issue.assigneeAgentId !== agentId) {
    throw forbidden("Agents may only reserve files for a task assigned to them");
  }
  const agent = await input.db
    .select({ id: agents.id, name: agents.name, companyId: agents.companyId })
    .from(agents)
    .where(eq(agents.id, agentId))
    .then((rows) => rows[0] ?? null);
  if (!agent || agent.companyId !== input.companyId) throw notFound("Agent not found in this company");
  return { issue, agent };
}

async function validateRun(input: {
  db: Db;
  runId: string | null | undefined;
  companyId: string;
  agentId: string;
}) {
  if (!input.runId) return;
  const run = await input.db
    .select({ companyId: heartbeatRuns.companyId, agentId: heartbeatRuns.agentId })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.id, input.runId))
    .then((rows) => rows[0] ?? null);
  if (!run || run.companyId !== input.companyId || run.agentId !== input.agentId) {
    throw forbidden("Run does not belong to this company and agent");
  }
}

async function markExpiredReservationsOrphaned(tx: any, projectId: string, now: Date) {
  await tx
    .update(fileReservations)
    .set({ status: "orphaned", updatedAt: now })
    .where(and(
      eq(fileReservations.projectId, projectId),
      eq(fileReservations.status, "active"),
      lte(fileReservations.leaseExpiresAt, now),
    ));
}

function findConflicts(
  requestedPaths: readonly string[],
  activeRows: readonly FileReservationRow[],
  ownIssueId?: string,
): FileReservationConflict[] {
  const result: FileReservationConflict[] = [];
  for (const requestedPath of requestedPaths) {
    const held = activeRows.find((row) => row.issueId !== ownIssueId && reservedPathsOverlap(requestedPath, row.normalizedPath));
    if (!held) continue;
    result.push({
      path: requestedPath,
      heldPath: held.normalizedPath,
      reservationId: held.id,
      issueId: held.issueId,
      agentId: held.agentId,
      status: held.status as "active" | "orphaned",
      leaseExpiresAt: held.leaseExpiresAt ?? null,
    });
  }
  return result;
}

export function reservationWaitCycle(input: {
  requesterIssueId: string;
  blockerIssueIds: string[];
  reservations: Array<{ id: string; issueId: string; status: string; blockedByReservationId: string | null }>;
}): string[] | null {
  const holderByReservationId = new Map(
    input.reservations
      .filter((row) => row.status === "active" || row.status === "orphaned")
      .map((row) => [row.id, row.issueId]),
  );
  const graph = new Map<string, Set<string>>();
  for (const row of input.reservations) {
    if (row.status !== "waiting" || !row.blockedByReservationId) continue;
    const holder = holderByReservationId.get(row.blockedByReservationId);
    if (!holder || holder === row.issueId) continue;
    const edges = graph.get(row.issueId) ?? new Set<string>();
    edges.add(holder);
    graph.set(row.issueId, edges);
  }
  graph.set(input.requesterIssueId, new Set(input.blockerIssueIds));
  const visit = (node: string, pathSoFar: string[], visiting: Set<string>): string[] | null => {
    if (node === input.requesterIssueId && pathSoFar.length > 0) return [...pathSoFar, node];
    if (visiting.has(node)) return null;
    const nextVisiting = new Set(visiting).add(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next, [...pathSoFar, node], nextVisiting);
      if (cycle) return cycle;
    }
    return null;
  };
  for (const blocker of input.blockerIssueIds) {
    const cycle = visit(blocker, [input.requesterIssueId], new Set([input.requesterIssueId]));
    if (cycle) return cycle;
  }
  return null;
}

function mergeExecutionState(existing: unknown, patch: Record<string, unknown>) {
  const state = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return { ...state, light: { ...(state.light && typeof state.light === "object" ? state.light : {}), ...patch } };
}

async function promoteWaitingReservations(tx: any, input: {
  projectId: string;
  projectWorkspaceId: string;
  leaseSeconds: number;
  now: Date;
}) {
  const active = await tx
    .select()
    .from(fileReservations)
    .where(and(
      eq(fileReservations.projectId, input.projectId),
      eq(fileReservations.projectWorkspaceId, input.projectWorkspaceId),
      inArray(fileReservations.status, [...ACTIVE_RESERVATION_STATUSES]),
    ));
  const waiting = await tx
    .select()
    .from(fileReservations)
    .where(and(
      eq(fileReservations.projectId, input.projectId),
      eq(fileReservations.projectWorkspaceId, input.projectWorkspaceId),
      eq(fileReservations.status, "waiting"),
    ))
    .orderBy(asc(fileReservations.createdAt));

  const byRequest = new Map<string, FileReservationRow[]>();
  for (const row of waiting) {
    const group = byRequest.get(row.requestId) ?? [];
    group.push(row);
    byRequest.set(row.requestId, group);
  }

  const promoted: FileReservationRow[] = [];
  for (const group of byRequest.values()) {
    const issue = await tx
      .select()
      .from(issues)
      .where(eq(issues.id, group[0]!.issueId))
      .then((rows: Array<typeof issues.$inferSelect>) => rows[0] ?? null);
    if (!issue || ["done", "failed", "cancelled"].includes(issue.status)) {
      await tx
        .update(fileReservations)
        .set({ status: "cancelled", releasedAt: input.now, releaseReason: "task_terminal", updatedAt: input.now })
        .where(eq(fileReservations.requestId, group[0]!.requestId));
      continue;
    }
    const conflicts = findConflicts(group.map((row) => row.normalizedPath), active, group[0]!.issueId);
    if (conflicts.length > 0) continue;

    const leaseExpiresAt = new Date(input.now.getTime() + input.leaseSeconds * 1_000);
    const rows = await tx
      .update(fileReservations)
      .set({
        status: "active",
        blockedByReservationId: null,
        leaseExpiresAt,
        lastRenewedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(fileReservations.requestId, group[0]!.requestId))
      .returning();
    active.push(...rows);
    promoted.push(...rows);

    if (issue.status === "paused" && issue.pauseReason === "file_reservation") {
      await tx
        .update(issues)
        .set({
          status: "in_progress",
          pauseReason: null,
          pausedAt: null,
          executionState: mergeExecutionState(issue.executionState, {
            reservationRequestId: group[0]!.requestId,
            filesReadyAt: input.now.toISOString(),
          }),
          updatedAt: input.now,
        })
        .where(eq(issues.id, issue.id));
      await tx.insert(agentWakeupRequests).values({
        companyId: issue.companyId,
        agentId: group[0]!.agentId,
        source: "file_reservation",
        triggerDetail: "files_available",
        reason: "Reserved files became available",
        payload: { issueId: issue.id, reservationRequestId: group[0]!.requestId },
        requestedByActorType: "system",
        requestedByActorId: "light_repository_broker",
        idempotencyKey: `file-reservation-ready:${group[0]!.requestId}`,
      });
    }
  }
  return promoted;
}

export function lightFileReservationService(db: Db) {
  return {
    list: async (projectId: string, options: { issueId?: string; status?: string } = {}) => {
      const scope = await resolveScope(db, projectId);
      const conditions = [eq(fileReservations.projectId, projectId)];
      if (options.issueId) conditions.push(eq(fileReservations.issueId, options.issueId));
      if (options.status) conditions.push(eq(fileReservations.status, options.status));
      const rows = await db.select().from(fileReservations).where(and(...conditions)).orderBy(asc(fileReservations.createdAt));
      return { companyId: scope.project.companyId, rows: rows.map(toReservation) };
    },

    reserve: async (
      projectId: string,
      input: ReserveProjectFilesInput,
      actor: LightExecutionActor,
    ): Promise<{ companyId: string; result: FileReservationResult }> => {
      const scope = await resolveScope(db, projectId);
      const paths = await canonicalizePathSet(scope.cwd, input.paths);
      if (paths.length > scope.policy.maxReservedFilesPerTask) {
        throw unprocessable(`A task may reserve at most ${scope.policy.maxReservedFilesPerTask} files`);
      }
      const { issue, agent } = await resolveIssueAndAgent({
        db,
        companyId: scope.project.companyId,
        projectId,
        issueId: input.issueId,
        requestedAgentId: input.agentId,
        actor,
      });
      const runId = input.runId ?? actor.runId ?? null;
      await validateRun({ db, runId, companyId: scope.project.companyId, agentId: agent.id });
      const requestId = randomUUID();
      const leaseSeconds = input.leaseSeconds ?? scope.policy.reservationLeaseSeconds;
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`light-files:${projectId}:${scope.workspace.id}`}, 0))`);
        const now = new Date();
        await markExpiredReservationsOrphaned(tx, projectId, now);
        const active = await tx
          .select()
          .from(fileReservations)
          .where(and(
            eq(fileReservations.projectId, projectId),
            eq(fileReservations.projectWorkspaceId, scope.workspace.id),
            inArray(fileReservations.status, [...ACTIVE_RESERVATION_STATUSES]),
          ));
        const ownExact = new Map(
          active
            .filter((row) => row.issueId === issue.id && row.agentId === agent.id)
            .map((row) => [row.normalizedPath, row]),
        );
        const conflicts = findConflicts(paths, active, issue.id);
        if (conflicts.length > 0) {
          const reservations = await tx
            .select({
              id: fileReservations.id,
              issueId: fileReservations.issueId,
              status: fileReservations.status,
              blockedByReservationId: fileReservations.blockedByReservationId,
            })
            .from(fileReservations)
            .where(and(
              eq(fileReservations.projectId, projectId),
              eq(fileReservations.projectWorkspaceId, scope.workspace.id),
              inArray(fileReservations.status, ["active", "orphaned", "waiting"]),
            ));
          const cycle = reservationWaitCycle({
            requesterIssueId: issue.id,
            blockerIssueIds: [...new Set(conflicts.map((entry) => entry.issueId))],
            reservations,
          });
          if (cycle) {
            throw conflict("File reservation would create a deadlock", {
              code: "file_reservation_deadlock",
              issueCycle: cycle,
            });
          }
        }
        const status = conflicts.length > 0 ? "waiting" : "active";
        const leaseExpiresAt = status === "active" ? new Date(now.getTime() + leaseSeconds * 1_000) : null;
        const newPaths = paths.filter((reservedPath) => !ownExact.has(reservedPath));
        const inserted = newPaths.length > 0
          ? await tx
            .insert(fileReservations)
            .values(newPaths.map((reservedPath) => ({
              requestId,
              companyId: scope.project.companyId,
              projectId,
              projectWorkspaceId: scope.workspace.id,
              issueId: issue.id,
              agentId: agent.id,
              runId,
              path: reservedPath,
              normalizedPath: reservedPath,
              status,
              blockedByReservationId: conflicts.find((entry) => entry.path === reservedPath)?.reservationId ?? null,
              leaseExpiresAt,
              lastRenewedAt: status === "active" ? now : null,
              metadata: { enforcement: scope.policy.enforcement },
            })))
            .returning()
          : [];
        const existing = [...ownExact.values()].filter((row) => paths.includes(row.normalizedPath));
        if (status === "active" && existing.length > 0) {
          await tx
            .update(fileReservations)
            .set({ leaseExpiresAt, lastRenewedAt: now, updatedAt: now })
            .where(inArray(fileReservations.id, existing.map((row) => row.id)));
          for (const row of existing) {
            row.leaseExpiresAt = leaseExpiresAt;
            row.lastRenewedAt = now;
            row.updatedAt = now;
          }
        }
        if (status === "waiting" && issue.status !== "paused") {
          await tx
            .update(issues)
            .set({
              status: "paused",
              pauseReason: "file_reservation",
              pausedAt: now,
              executionState: mergeExecutionState(issue.executionState, {
                reservationRequestId: requestId,
                waitingOnReservationIds: conflicts.map((entry) => entry.reservationId),
                pausedAt: now.toISOString(),
              }),
              updatedAt: now,
            })
            .where(eq(issues.id, issue.id));
        }
        return {
          requestId,
          status,
          reservations: [...existing, ...inserted].map(toReservation),
          conflicts,
        } satisfies FileReservationResult;
      });
      return { companyId: scope.project.companyId, result };
    },

    renew: async (projectId: string, input: RenewProjectFilesInput, actor: LightExecutionActor) => {
      const scope = await resolveScope(db, projectId);
      const { agent } = await resolveIssueAndAgent({
        db,
        companyId: scope.project.companyId,
        projectId,
        issueId: input.issueId,
        actor,
      });
      const runId = input.runId ?? actor.runId ?? null;
      await validateRun({ db, runId, companyId: scope.project.companyId, agentId: agent.id });
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + (input.leaseSeconds ?? scope.policy.reservationLeaseSeconds) * 1_000);
      const rows = await db
        .update(fileReservations)
        .set({ leaseExpiresAt, lastRenewedAt: now, updatedAt: now })
        .where(and(
          eq(fileReservations.projectId, projectId),
          eq(fileReservations.issueId, input.issueId),
          eq(fileReservations.agentId, agent.id),
          eq(fileReservations.status, "active"),
          ...(runId ? [eq(fileReservations.runId, runId)] : []),
        ))
        .returning();
      if (rows.length === 0) throw conflict("No active file reservations could be renewed");
      return { companyId: scope.project.companyId, rows: rows.map(toReservation) };
    },

    release: async (projectId: string, input: ReleaseProjectFilesInput, actor: LightExecutionActor) => {
      const scope = await resolveScope(db, projectId);
      if (input.force && actor.actorType === "agent") throw forbidden("Only a human may force-release file reservations");
      const forceRelease = input.force === true && actor.actorType === "user";
      const agent = forceRelease
        ? null
        : (await resolveIssueAndAgent({
            db,
            companyId: scope.project.companyId,
            projectId,
            issueId: input.issueId,
            actor,
          })).agent;
      if (forceRelease) {
        const issue = await db
          .select({ id: issues.id })
          .from(issues)
          .where(and(
            eq(issues.id, input.issueId),
            eq(issues.companyId, scope.project.companyId),
            eq(issues.projectId, projectId),
          ))
          .then((rows) => rows[0] ?? null);
        if (!issue) throw notFound("Task not found in this project");
      }
      const normalizedPaths = input.paths ? await canonicalizePathSet(scope.cwd, input.paths) : null;
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`light-files:${projectId}:${scope.workspace.id}`}, 0))`);
        const now = new Date();
        const conditions = [
          eq(fileReservations.projectId, projectId),
          eq(fileReservations.issueId, input.issueId),
          inArray(fileReservations.status, ["active", "waiting", "orphaned"]),
        ];
        if (!forceRelease) conditions.push(eq(fileReservations.agentId, agent!.id));
        if (input.runId) conditions.push(eq(fileReservations.runId, input.runId));
        if (normalizedPaths) conditions.push(inArray(fileReservations.normalizedPath, normalizedPaths));
        const released = await tx
          .update(fileReservations)
          .set({
            status: "released",
            releasedAt: now,
            releaseReason: forceRelease ? "human_force_release" : "owner_release",
            updatedAt: now,
          })
          .where(and(...conditions))
          .returning();
        const promoted = await promoteWaitingReservations(tx, {
          projectId,
          projectWorkspaceId: scope.workspace.id,
          leaseSeconds: scope.policy.reservationLeaseSeconds,
          now,
        });
        return { released: released.map(toReservation), promoted: promoted.map(toReservation) };
      });
      return { companyId: scope.project.companyId, ...result };
    },

    releaseForIssueLifecycle: async (projectId: string, issueId: string, reason: string) => {
      const scope = await resolveScope(db, projectId);
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`light-files:${projectId}:${scope.workspace.id}`}, 0))`);
        const now = new Date();
        const released = await tx.update(fileReservations).set({
          status: "released",
          releasedAt: now,
          releaseReason: reason.slice(0, 255),
          updatedAt: now,
        }).where(and(
          eq(fileReservations.projectId, projectId),
          eq(fileReservations.issueId, issueId),
          inArray(fileReservations.status, ["active", "waiting", "orphaned"]),
        )).returning();
        const promoted = await promoteWaitingReservations(tx, {
          projectId,
          projectWorkspaceId: scope.workspace.id,
          leaseSeconds: scope.policy.reservationLeaseSeconds,
          now,
        });
        return { released: released.map(toReservation), promoted: promoted.map(toReservation) };
      });
      return { companyId: scope.project.companyId, ...result };
    },
  };
}

type CommandResult = { stdout: string; stderr: string; exitCode: number };

function appendWithLimit(current: string, chunk: Buffer | string) {
  return `${current}${chunk.toString()}`.slice(-RESERVATION_OUTPUT_LIMIT);
}

function runProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdin?: string;
  outputLimit?: number;
}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: [input.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
      } else {
        child.kill("SIGTERM");
      }
    }, input.timeoutMs ?? REPOSITORY_OPERATION_TIMEOUT_MS);
    timer.unref?.();
    const append = (current: string, chunk: Buffer | string) =>
      `${current}${chunk.toString()}`.slice(-(input.outputLimit ?? RESERVATION_OUTPUT_LIMIT));
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Repository command exceeded ${input.timeoutMs ?? REPOSITORY_OPERATION_TIMEOUT_MS}ms`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
    if (input.stdin !== undefined) {
      child.stdin?.end(input.stdin);
    }
  });
}

async function runGit(cwd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return runProcess({ command: "git", args: ["-C", cwd, ...args], cwd, env });
}

function ensureCommandSucceeded(result: CommandResult, label: string) {
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode}): ${result.stderr || result.stdout}`.slice(0, RESERVATION_OUTPUT_LIMIT));
  }
  return result;
}

const repositoryChains = new Map<string, Promise<unknown>>();

async function serializeRepositoryOperation<T>(workspaceId: string, operation: () => Promise<T>): Promise<T> {
  const previous = repositoryChains.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const current = previous.catch(() => undefined).then(() => gate);
  repositoryChains.set(workspaceId, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (repositoryChains.get(workspaceId) === current) repositoryChains.delete(workspaceId);
  }
}

async function assertPathsReserved(db: Db, input: {
  projectId: string;
  workspaceId: string;
  issueId: string;
  agentId: string;
  paths: string[];
}) {
  const reservations = await db
    .select()
    .from(fileReservations)
    .where(and(
      eq(fileReservations.projectId, input.projectId),
      eq(fileReservations.projectWorkspaceId, input.workspaceId),
      eq(fileReservations.issueId, input.issueId),
      eq(fileReservations.agentId, input.agentId),
      eq(fileReservations.status, "active"),
    ));
  const missing = input.paths.filter((requestedPath) =>
    !reservations.some((reservation) =>
      requestedPath === reservation.normalizedPath || requestedPath.startsWith(`${reservation.normalizedPath}/`)
    )
  );
  if (missing.length > 0) {
    throw conflict("Repository mutation includes files not reserved by this task", {
      code: "unreserved_repository_paths",
      paths: missing,
    });
  }
}

async function assertValidationBarrier(db: Db, input: {
  projectId: string;
  workspaceId: string;
  issueId: string;
}) {
  const blockers = await db
    .select({ id: fileReservations.id, issueId: fileReservations.issueId, path: fileReservations.normalizedPath })
    .from(fileReservations)
    .where(and(
      eq(fileReservations.projectId, input.projectId),
      eq(fileReservations.projectWorkspaceId, input.workspaceId),
      inArray(fileReservations.status, [...ACTIVE_RESERVATION_STATUSES]),
      ne(fileReservations.issueId, input.issueId),
    ));
  if (blockers.length > 0) {
    throw conflict("Validation barrier is waiting for other file owners", {
      code: "validation_barrier_waiting",
      blockers,
    });
  }
}

async function changedPaths(cwd: string, requestedPaths: string[] | undefined) {
  const pathArgs = requestedPaths && requestedPaths.length > 0 ? ["--", ...requestedPaths] : [];
  const [tracked, untracked] = await Promise.all([
    runGit(cwd, ["diff", "--name-only", "HEAD", ...pathArgs]),
    runGit(cwd, ["ls-files", "--others", "--exclude-standard", ...pathArgs]),
  ]);
  ensureCommandSucceeded(tracked, "git diff --name-only");
  ensureCommandSucceeded(untracked, "git ls-files");
  return normalizePathSet(`${tracked.stdout}\n${untracked.stdout}`.split("\n").filter(Boolean));
}

async function executeRepositoryOperation(input: {
  db: Db;
  operationId: string;
  cwd: string;
  workspaceId: string;
  projectId: string;
  issueId: string;
  agent: { id: string; name: string };
  policy: LightRepositoryPolicy;
  request: RepositoryOperationInput;
}) {
  const requestedPaths = input.request.paths ? await canonicalizePathSet(input.cwd, input.request.paths) : undefined;
  if (input.request.kind === "status") {
    return ensureCommandSucceeded(
      await runGit(input.cwd, ["status", "--short", "--branch", ...(requestedPaths?.length ? ["--", ...requestedPaths] : [])]),
      "git status",
    );
  }
  if (input.request.kind === "diff") {
    return ensureCommandSucceeded(
      await runGit(input.cwd, ["diff", "--no-ext-diff", "HEAD", "--", ...(requestedPaths ?? [])]),
      "git diff",
    );
  }
  if (input.request.kind === "fetch") {
    if (!branchIsSafe(input.policy.remoteName)) throw unprocessable("Project Git remote name is invalid");
    return ensureCommandSucceeded(
      await runGit(input.cwd, ["fetch", "--prune", input.policy.remoteName]),
      "git fetch",
    );
  }
  if (input.request.kind === "sync") {
    if (!branchIsSafe(input.policy.remoteName)) throw unprocessable("Project Git remote name is invalid");
    ensureCommandSucceeded(await runGit(input.cwd, ["fetch", "--prune", input.policy.remoteName]), "git fetch");
    return ensureCommandSucceeded(
      await runGit(input.cwd, ["merge", "--ff-only", `${input.policy.remoteName}/${input.policy.activeBranch}`]),
      "git merge --ff-only",
    );
  }
  if (input.request.kind === "validate") {
    if (input.policy.requireCleanValidationBarrier) {
      await assertValidationBarrier(input.db, {
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        issueId: input.issueId,
      });
    }
    const validationCommands = input.policy.validationCommands.length > 0
      ? input.policy.validationCommands
      : input.policy.validationCommand ? [input.policy.validationCommand] : [];
    if (validationCommands.length === 0) {
      return ensureCommandSucceeded(await runGit(input.cwd, ["diff", "--check"]), "git diff --check");
    }
    const shell = process.platform === "win32" ? "cmd.exe" : process.env.SHELL || "/bin/sh";
    const outputs: string[] = [];
    for (const command of validationCommands) {
      const shellArgs = process.platform === "win32"
        ? ["/d", "/s", "/c", command]
        : ["-lc", command];
      const result = ensureCommandSucceeded(
        await runProcess({ command: shell, args: shellArgs, cwd: input.cwd }),
        `Project validation (${command})`,
      );
      outputs.push(`$ ${command}\n${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`);
    }
    return { stdout: outputs.join("\n\n"), stderr: "", exitCode: 0 };
  }
  if (input.request.kind === "commit") {
    if (!input.policy.allowAgentCommit) throw forbidden("Agent commits are disabled by the project policy");
    const currentBranch = ensureCommandSucceeded(
      await runGit(input.cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
      "git symbolic-ref",
    ).stdout.trim();
    if (currentBranch !== input.policy.activeBranch) {
      throw new Error(
        `Shared checkout is on ${currentBranch || "a detached HEAD"}; project policy requires ${input.policy.activeBranch}`,
      );
    }
    const paths = await canonicalizePathSet(input.cwd, await changedPaths(input.cwd, requestedPaths));
    if (paths.length === 0) throw unprocessable("No changed files are available to commit");
    await assertPathsReserved(input.db, {
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      agentId: input.agent.id,
      paths,
    });
    const oldHead = ensureCommandSucceeded(await runGit(input.cwd, ["rev-parse", "HEAD"]), "git rev-parse").stdout.trim();
    const gitDirRaw = ensureCommandSucceeded(await runGit(input.cwd, ["rev-parse", "--git-dir"]), "git rev-parse --git-dir").stdout.trim();
    const gitDir = path.resolve(input.cwd, gitDirRaw);
    const indexPath = path.join(gitDir, `paperclip-index-${input.operationId}`);
    const env = {
      ...process.env,
      GIT_INDEX_FILE: indexPath,
      GIT_AUTHOR_NAME: input.agent.name,
      GIT_AUTHOR_EMAIL: `${input.agent.id}@agents.paperclip.local`,
      GIT_COMMITTER_NAME: "Paperclip Repository Broker",
      GIT_COMMITTER_EMAIL: "broker@paperclip.local",
    };
    try {
      ensureCommandSucceeded(await runGit(input.cwd, ["read-tree", oldHead], env), "git read-tree");
      ensureCommandSucceeded(await runGit(input.cwd, ["add", "--", ...paths], env), "git add");
      const tree = ensureCommandSucceeded(await runGit(input.cwd, ["write-tree"], env), "git write-tree").stdout.trim();
      const message = `${input.request.message}\n\nPaperclip-Task: ${input.issueId}\nPaperclip-Agent: ${input.agent.id}${input.request.runId ? `\nPaperclip-Run: ${input.request.runId}` : ""}`;
      const commit = ensureCommandSucceeded(
        await runGit(input.cwd, ["commit-tree", tree, "-p", oldHead, "-m", message], env),
        "git commit-tree",
      ).stdout.trim();
      ensureCommandSucceeded(await runGit(input.cwd, ["update-ref", "HEAD", commit, oldHead]), "git update-ref");
      // The temporary index deliberately excluded other tasks' files. Sync the
      // shared default index to the new HEAD after the atomic ref update so a
      // later `git diff` or broker commit never sees a stale pre-commit index.
      // Working-tree edits are preserved and remain unstaged.
      ensureCommandSucceeded(await runGit(input.cwd, ["reset", "--mixed", "--quiet", commit]), "git reset --mixed");
      return { stdout: commit, stderr: "", exitCode: 0, commitSha: commit };
    } finally {
      await fs.unlink(indexPath).catch(() => undefined);
      await fs.unlink(`${indexPath}.lock`).catch(() => undefined);
    }
  }
  const targetBranch = input.request.targetBranch!;
  if (input.request.kind === "merge") {
    if (!input.policy.allowAgentMerge) throw forbidden("Agent merges are disabled by the project policy");
    if (!branchIsSafe(targetBranch) || !input.policy.allowedMergeTargets.includes(targetBranch)) {
      throw forbidden(`Merge source is not allowed by the project policy: ${targetBranch}`);
    }
    return ensureCommandSucceeded(
      await runGit(input.cwd, ["merge", "--ff-only", targetBranch]),
      "git merge --ff-only",
    );
  }
  if (!input.policy.allowAgentPush) throw forbidden("Agent pushes are disabled by the project policy");
  if (!branchIsSafe(targetBranch) || !input.policy.allowedPushBranches.includes(targetBranch)) {
    throw forbidden(`Push target is not allowed by the project policy: ${targetBranch}`);
  }
  if (!branchIsSafe(input.policy.remoteName)) throw unprocessable("Project Git remote name is invalid");
  const currentBranch = ensureCommandSucceeded(
    await runGit(input.cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    "git symbolic-ref",
  ).stdout.trim();
  if (currentBranch !== input.policy.activeBranch) {
    throw new Error(
      `Shared checkout is on ${currentBranch || "a detached HEAD"}; project policy requires ${input.policy.activeBranch}`,
    );
  }
  return ensureCommandSucceeded(
    await runGit(input.cwd, ["push", input.policy.remoteName, `HEAD:refs/heads/${targetBranch}`]),
    "git push",
  );
}

export function lightRepositoryService(db: Db) {
  return {
    listOperations: async (projectId: string, issueId?: string) => {
      const scope = await resolveScope(db, projectId);
      const conditions = [eq(repositoryOperations.projectId, projectId)];
      if (issueId) conditions.push(eq(repositoryOperations.issueId, issueId));
      const rows = await db
        .select()
        .from(repositoryOperations)
        .where(and(...conditions))
        .orderBy(asc(repositoryOperations.createdAt));
      return { companyId: scope.project.companyId, rows: rows.map(toRepositoryOperation) };
    },

    run: async (projectId: string, request: RepositoryOperationInput, actor: LightExecutionActor) => {
      const scope = await resolveScope(db, projectId);
      if (request.kind === "merge" && scope.policy.requireHumanApprovalForMerge && actor.actorType === "agent") {
        throw forbidden("This project requires a human to approve and execute merges", {
          code: "light_repository_merge_approval_required",
        });
      }
      const { agent } = await resolveIssueAndAgent({
        db,
        companyId: scope.project.companyId,
        projectId,
        issueId: request.issueId,
        actor,
      });
      const runId = request.runId ?? actor.runId ?? null;
      await validateRun({ db, runId, companyId: scope.project.companyId, agentId: agent.id });
      const normalizedRequest = {
        ...request,
        runId,
        paths: request.paths ? await canonicalizePathSet(scope.cwd, request.paths) : undefined,
      };

      const staleBefore = new Date(Date.now() - STALE_REPOSITORY_OPERATION_MS);
      await db
        .update(repositoryOperations)
        .set({
          status: "failed",
          error: "Repository broker operation was orphaned after its owner stopped",
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(repositoryOperations.projectWorkspaceId, scope.workspace.id),
          inArray(repositoryOperations.status, ["queued", "running"]),
          lte(repositoryOperations.createdAt, staleBefore),
        ));

      let created: RepositoryOperationRow;
      try {
        created = await db
          .insert(repositoryOperations)
          .values({
            companyId: scope.project.companyId,
            projectId,
            projectWorkspaceId: scope.workspace.id,
            issueId: request.issueId,
            agentId: agent.id,
            runId,
            kind: request.kind,
            paths: normalizedRequest.paths ?? null,
            targetBranch: request.targetBranch ?? null,
            metadata: { actorType: actor.actorType, actorId: actor.actorId },
          })
          .returning()
          .then((rows) => rows[0]!);
      } catch (error) {
        throw conflict("Another repository operation is already active for this shared checkout", {
          code: "repository_operation_in_progress",
          cause: error instanceof Error ? error.message : String(error),
        });
      }

      return serializeRepositoryOperation(scope.workspace.id, async () => {
        await db
          .update(repositoryOperations)
          .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
          .where(eq(repositoryOperations.id, created.id));
        try {
          const result = await executeRepositoryOperation({
            db,
            operationId: created.id,
            cwd: scope.cwd,
            workspaceId: scope.workspace.id,
            projectId,
            issueId: request.issueId,
            agent,
            policy: scope.policy,
            request: normalizedRequest,
          });
          const updated = await db
            .update(repositoryOperations)
            .set({
              status: "succeeded",
              exitCode: String(result.exitCode),
              stdoutExcerpt: result.stdout.slice(-RESERVATION_OUTPUT_LIMIT),
              stderrExcerpt: result.stderr.slice(-RESERVATION_OUTPUT_LIMIT),
              commitSha: "commitSha" in result ? result.commitSha : null,
              finishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(repositoryOperations.id, created.id))
            .returning()
            .then((rows) => rows[0]!);
          return { companyId: scope.project.companyId, operation: toRepositoryOperation(updated) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const updated = await db
            .update(repositoryOperations)
            .set({
              status: "failed",
              error: message.slice(0, RESERVATION_OUTPUT_LIMIT),
              finishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(repositoryOperations.id, created.id))
            .returning()
            .then((rows) => rows[0]!);
          throw conflict("Repository operation failed", {
            code: "repository_operation_failed",
            operation: toRepositoryOperation(updated),
          });
        }
      });
    },
  };
}

const CHECKPOINT_PATCH_LIMIT = 2 * 1024 * 1024;

export function lightTaskCheckpointService(db: Db) {
  return {
    list: async (projectId: string, issueId?: string) => {
      const scope = await resolveScope(db, projectId);
      const conditions = [eq(taskCheckpoints.projectId, projectId)];
      if (issueId) conditions.push(eq(taskCheckpoints.issueId, issueId));
      const rows = await db.select().from(taskCheckpoints).where(and(...conditions)).orderBy(asc(taskCheckpoints.createdAt));
      return { companyId: scope.project.companyId, rows };
    },

    capture: async (
      projectId: string,
      issueId: string,
      input: CaptureTaskCheckpointInput,
      actor: LightExecutionActor,
    ) => {
      const scope = await resolveScope(db, projectId);
      const { agent } = await resolveIssueAndAgent({
        db,
        companyId: scope.project.companyId,
        projectId,
        issueId,
        requestedAgentId: input.agentId,
        actor,
      });
      const runId = input.runId ?? actor.runId ?? null;
      await validateRun({ db, runId, companyId: scope.project.companyId, agentId: agent.id });
      const paths = await canonicalizePathSet(scope.cwd, input.paths);
      await assertPathsReserved(db, {
        projectId,
        workspaceId: scope.workspace.id,
        issueId,
        agentId: agent.id,
        paths,
      });
      return serializeRepositoryOperation(scope.workspace.id, async () => {
        const head = ensureCommandSucceeded(await runGit(scope.cwd, ["rev-parse", "HEAD"]), "git rev-parse").stdout.trim();
        const gitDirRaw = ensureCommandSucceeded(await runGit(scope.cwd, ["rev-parse", "--git-dir"]), "git rev-parse --git-dir").stdout.trim();
        const indexPath = path.join(path.resolve(scope.cwd, gitDirRaw), `paperclip-checkpoint-${randomUUID()}`);
        const env = { ...process.env, GIT_INDEX_FILE: indexPath };
        try {
          ensureCommandSucceeded(await runGit(scope.cwd, ["read-tree", head], env), "git read-tree");
          ensureCommandSucceeded(await runGit(scope.cwd, ["add", "--", ...paths], env), "git add checkpoint paths");
          const patchResult = await runProcess({
            command: "git",
            args: ["-C", scope.cwd, "diff", "--cached", "--binary", "--full-index", head, "--", ...paths],
            cwd: scope.cwd,
            env,
            outputLimit: CHECKPOINT_PATCH_LIMIT + 1,
          });
          ensureCommandSucceeded(patchResult, "git diff checkpoint");
          if (!patchResult.stdout) throw unprocessable("No local changes exist for the requested checkpoint paths");
          if (Buffer.byteLength(patchResult.stdout) > CHECKPOINT_PATCH_LIMIT) {
            throw unprocessable("Checkpoint patch exceeds the 2 MiB inline safety limit");
          }
          const patchSha256 = createHash("sha256").update(patchResult.stdout).digest("hex");
          return db.insert(taskCheckpoints).values({
            companyId: scope.project.companyId,
            projectId,
            projectWorkspaceId: scope.workspace.id,
            issueId,
            agentId: agent.id,
            runId,
            baseSha: head,
            paths,
            patchStore: "inline",
            patchRef: patchResult.stdout,
            patchSha256,
            summary: input.summary ?? null,
            metadata: { bytes: Buffer.byteLength(patchResult.stdout), actorType: actor.actorType },
          }).returning().then((rows) => rows[0]!);
        } finally {
          await fs.unlink(indexPath).catch(() => {});
        }
      });
    },

    restore: async (
      projectId: string,
      issueId: string,
      checkpointId: string,
      input: RestoreTaskCheckpointInput,
      actor: LightExecutionActor,
    ) => {
      const scope = await resolveScope(db, projectId);
      const checkpoint = await db.select().from(taskCheckpoints)
        .where(and(eq(taskCheckpoints.id, checkpointId), eq(taskCheckpoints.projectId, projectId), eq(taskCheckpoints.issueId, issueId)))
        .then((rows) => rows[0] ?? null);
      if (!checkpoint) throw notFound("Task checkpoint not found");
      if (checkpoint.status !== "available" || checkpoint.patchStore !== "inline" || !checkpoint.patchRef) {
        throw conflict("Task checkpoint is not available for restore");
      }
      const { agent } = await resolveIssueAndAgent({
        db,
        companyId: scope.project.companyId,
        projectId,
        issueId,
        requestedAgentId: checkpoint.agentId,
        actor,
      });
      await validateRun({ db, runId: input.runId ?? actor.runId, companyId: scope.project.companyId, agentId: agent.id });
      await assertPathsReserved(db, {
        projectId,
        workspaceId: scope.workspace.id,
        issueId,
        agentId: agent.id,
        paths: checkpoint.paths as string[],
      });
      return serializeRepositoryOperation(scope.workspace.id, async () => {
        const result = await runProcess({
          command: "git",
          args: ["-C", scope.cwd, "apply", "--3way", "--whitespace=nowarn", "-"],
          cwd: scope.cwd,
          stdin: checkpoint.patchRef!,
          outputLimit: CHECKPOINT_PATCH_LIMIT,
        });
        if (result.exitCode !== 0) {
          const failed = await db.update(taskCheckpoints).set({
            status: "conflict",
            metadata: { ...(checkpoint.metadata as Record<string, unknown> ?? {}), restoreError: result.stderr || result.stdout },
            updatedAt: new Date(),
          }).where(eq(taskCheckpoints.id, checkpoint.id)).returning().then((rows) => rows[0]!);
          throw conflict("Checkpoint restore conflicts with the current checkout", { checkpoint: failed });
        }
        return db.update(taskCheckpoints).set({
          status: "restored",
          restoredAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(taskCheckpoints.id, checkpoint.id)).returning().then((rows) => rows[0]!);
      });
    },

    discard: async (projectId: string, issueId: string, checkpointId: string, actor: LightExecutionActor) => {
      const scope = await resolveScope(db, projectId);
      const checkpoint = await db.select().from(taskCheckpoints)
        .where(and(eq(taskCheckpoints.id, checkpointId), eq(taskCheckpoints.projectId, projectId), eq(taskCheckpoints.issueId, issueId)))
        .then((rows) => rows[0] ?? null);
      if (!checkpoint) throw notFound("Task checkpoint not found");
      if (actor.actorType === "agent" && actor.agentId !== checkpoint.agentId) {
        throw forbidden("Only the checkpoint owner or a human may discard it");
      }
      const row = await db.update(taskCheckpoints).set({
        status: "discarded",
        patchRef: null,
        discardedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(taskCheckpoints.id, checkpoint.id), eq(taskCheckpoints.status, "available")))
        .returning().then((rows) => rows[0] ?? null);
      if (!row) throw conflict("Checkpoint is no longer available");
      return { companyId: scope.project.companyId, checkpoint: row };
    },
  };
}
