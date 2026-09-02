import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentWakeupRequests,
  agents,
  approvals,
  companies,
  companyMemberships,
  costEvents,
  heartbeatRuns,
  humanActions,
  issues,
  issueApprovals,
  lightExecutionEvents,
  lightConfigurationRevisions,
  projectMemoryItems,
  projects,
  projectWorkspaces,
  runContextComponents,
  taskReviews,
} from "@paperclipai/db";
import {
  lightCompanyConfigSchema,
  lightRepositoryPolicySchema,
  type ClaimHumanActionInput,
  type CompleteHumanActionInput,
  type CreateHumanActionInput,
  type DecideHumanActionInput,
  type ProjectMemoryCreateInput,
  type ProjectMemoryUpdateInput,
  type ReconcileHumanActionInput,
  type RollbackLightConfigurationInput,
  type TaskReviewDecisionInput,
  type TaskReviewRequestInput,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import type { LightExecutionActor } from "./light-execution.js";

const sha256 = (value: string) => createHash("sha256").update(value.normalize("NFC")).digest("hex");

function userId(actor: LightExecutionActor): string | null {
  return actor.actorType === "user" ? actor.actorId : null;
}

async function requireLightCompany(db: Db, companyId: string) {
  const company = await db.select().from(companies).where(eq(companies.id, companyId)).then((rows) => rows[0] ?? null);
  if (!company) throw notFound("Company not found");
  if (company.executionProfile !== "light") {
    throw unprocessable("This operation requires the Paperclip Light execution profile", {
      code: "light_execution_required",
    });
  }
  return { company, config: lightCompanyConfigSchema.parse(company.lightConfig ?? {}) };
}

async function requireProject(db: Db, projectId: string) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).then((rows) => rows[0] ?? null);
  if (!project) throw notFound("Project not found");
  await requireLightCompany(db, project.companyId);
  return project;
}

async function requireIssue(db: Db, issueId: string) {
  const issue = await db.select().from(issues).where(eq(issues.id, issueId)).then((rows) => rows[0] ?? null);
  if (!issue) throw notFound("Task not found");
  await requireLightCompany(db, issue.companyId);
  return issue;
}

export type ContextLedgerInput = {
  componentKind: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  content: string;
  included?: boolean;
  exclusionReason?: string | null;
  metadata?: Record<string, unknown>;
  priority?: number;
  required?: boolean;
  deduplicateOnResume?: boolean;
};

export type ContextLedgerPlanOptions = {
  resumedSession?: boolean;
  tokenBudget?: number;
  reservedOutputTokens?: number;
};

type PriorContextComponent = { id: string; contentHash: string };

export function planRunContextComponents(
  components: ContextLedgerInput[],
  prior: PriorContextComponent[],
  options: ContextLedgerPlanOptions = {},
) {
  const priorByHash = new Map(prior.map((row) => [row.contentHash, row.id]));
  const seenInRun = new Map<string, number>();
  const availableTokens = Math.max(
    0,
    (options.tokenBudget ?? Number.MAX_SAFE_INTEGER) - (options.reservedOutputTokens ?? 0),
  );
  const candidates = components.map((component, ordinal) => {
    const contentHash = sha256(component.content);
    const estimatedTokens = estimateContextTokens(component.content);
    const duplicateOfId = priorByHash.get(contentHash) ?? null;
    const duplicateOrdinal = seenInRun.get(contentHash);
    seenInRun.set(contentHash, ordinal);
    const requestedIncluded = component.included ?? component.content.length > 0;
    const repeatedInRun = duplicateOrdinal !== undefined;
    const repeatedFromResumedSession = Boolean(
      options.resumedSession
      && duplicateOfId
      && component.deduplicateOnResume !== false,
    );
    const duplicate = repeatedInRun || repeatedFromResumedSession;
    return {
      ordinal,
      component,
      contentHash,
      estimatedTokens,
      duplicateOfId,
      requestedIncluded,
      duplicate,
      repeatedInRun,
      repeatedFromResumedSession,
      required: component.required === true,
      priority: component.priority ?? 0,
    };
  });
  const requiredTokens = candidates
    .filter((entry) => entry.requestedIncluded && !entry.duplicate && entry.required)
    .reduce((sum, entry) => sum + entry.estimatedTokens, 0);
  let optionalTokensRemaining = Math.max(0, availableTokens - requiredTokens);
  const optionalIncluded = new Set<number>();
  for (const entry of candidates
    .filter((candidate) => candidate.requestedIncluded && !candidate.duplicate && !candidate.required)
    .sort((left, right) => right.priority - left.priority || left.ordinal - right.ordinal)) {
    if (entry.estimatedTokens > optionalTokensRemaining) continue;
    optionalIncluded.add(entry.ordinal);
    optionalTokensRemaining -= entry.estimatedTokens;
  }
  const finalUsedTokens = requiredTokens + [...optionalIncluded]
    .reduce((sum, ordinal) => sum + candidates[ordinal]!.estimatedTokens, 0);

  return candidates.map((entry) => {
    const included = entry.requestedIncluded
      && !entry.duplicate
      && (entry.required || optionalIncluded.has(entry.ordinal));
    const exclusionReason = entry.component.exclusionReason
      ?? (!entry.requestedIncluded ? "empty_or_not_selected"
        : entry.repeatedInRun ? "duplicate_in_run"
          : entry.repeatedFromResumedSession ? "duplicate_in_resumed_session"
            : !included ? "context_budget"
              : null);
    return {
      ordinal: entry.ordinal,
      contentHash: entry.contentHash,
      estimatedTokens: entry.estimatedTokens,
      duplicateOfId: entry.duplicateOfId,
      included,
      exclusionReason,
      metadata: {
        ...(entry.component.metadata ?? {}),
        duplicate: entry.duplicate,
        repeatedInRun: entry.repeatedInRun,
        repeatedFromResumedSession: entry.repeatedFromResumedSession,
        required: entry.required,
        priority: entry.priority,
        budgetTokens: availableTokens,
        budgetUsed: finalUsedTokens,
        budgetOverrun: requiredTokens > availableTokens,
      },
    };
  });
}

export function estimateContextTokens(value: string): number {
  if (!value) return 0;
  const normalized = value.normalize("NFC");
  const ascii = normalized.match(/[\x00-\x7F]/g)?.length ?? 0;
  const nonAscii = normalized.length - ascii;
  return Math.ceil(ascii / 4 + nonAscii / 2);
}

export function projectMemoryScore(input: {
  importance: number;
  confidence: number;
  lastConfirmedAt: Date | string;
}, now = new Date()): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(input.lastConfirmedAt).getTime()) / 86_400_000);
  const confidenceWeightedImportance = input.importance * (input.confidence / 100);
  // Old memory fades slowly, but an important confirmed constraint survives
  // much longer than low-value trivia. Re-confirming an item restores rank.
  return confidenceWeightedImportance - Math.log2(ageDays + 1) * 6;
}

type ProjectMemoryCandidate = {
  id: string;
  category: string;
  text: string;
  importance: number;
  confidence: number;
  lastConfirmedAt: Date | string;
};

function lexicalTokens(value: string): Set<string> {
  return new Set(
    value.normalize("NFKD")
      .toLocaleLowerCase("en")
      .replace(/[^a-z0-9\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

export function selectProjectMemoryItems<T extends ProjectMemoryCandidate>(
  items: T[],
  input: { taskText?: string; agentText?: string; tokenBudget: number; now?: Date },
): T[] {
  const queryTokens = lexicalTokens(`${input.taskText ?? ""}\n${input.agentText ?? ""}`);
  const now = input.now ?? new Date();
  const ranked = items.map((item) => {
    const itemTokens = lexicalTokens(`${item.category} ${item.text}`);
    let overlap = 0;
    for (const token of itemTokens) if (queryTokens.has(token)) overlap += 1;
    const relevanceBoost = queryTokens.size === 0 ? 0 : Math.min(35, overlap * 7);
    const warningBoost = item.category === "warning" || item.category === "constraint" ? 8 : 0;
    return { item, score: projectMemoryScore(item, now) + relevanceBoost + warningBoost };
  }).sort((left, right) => right.score - left.score || right.item.importance - left.item.importance);

  const selected: T[] = [];
  let usedTokens = 0;
  for (const { item } of ranked) {
    const itemTokens = estimateContextTokens(`- [${item.category}] ${item.text}`);
    if (itemTokens > input.tokenBudget - usedTokens) continue;
    selected.push(item);
    usedTokens += itemTokens;
  }
  return selected;
}

export function lightControlService(db: Db) {
  return {
    listExecutionEvents: async (companyId: string, options: { issueId?: string; limit?: number } = {}) => {
      await requireLightCompany(db, companyId);
      const conditions = [eq(lightExecutionEvents.companyId, companyId)];
      if (options.issueId) conditions.push(eq(lightExecutionEvents.issueId, options.issueId));
      return db.select().from(lightExecutionEvents)
        .where(and(...conditions))
        .orderBy(desc(lightExecutionEvents.createdAt))
        .limit(Math.min(500, Math.max(1, options.limit ?? 100)));
    },

    listRunContext: async (runId: string) => {
      const run = await db.select({ id: heartbeatRuns.id, companyId: heartbeatRuns.companyId })
        .from(heartbeatRuns).where(eq(heartbeatRuns.id, runId)).then((rows) => rows[0] ?? null);
      if (!run) throw notFound("Run not found");
      return db.select().from(runContextComponents)
        .where(eq(runContextComponents.runId, runId))
        .orderBy(runContextComponents.ordinal);
    },

    recordRunContext: async (
      companyId: string,
      runId: string,
      components: ContextLedgerInput[],
      options: ContextLedgerPlanOptions = {},
    ) => {
      if (components.length === 0) return [];
      const hashes = components.map((component) => sha256(component.content));
      const prior = await db.select({ id: runContextComponents.id, contentHash: runContextComponents.contentHash })
        .from(runContextComponents)
        .where(and(
          eq(runContextComponents.companyId, companyId),
          inArray(runContextComponents.contentHash, [...new Set(hashes)]),
        ));
      const plan = planRunContextComponents(components, prior, options);
      await db.insert(runContextComponents).values(components.map((component, ordinal) => {
        const decision = plan[ordinal]!;
        return {
          companyId,
          runId,
          ordinal,
          componentKind: component.componentKind,
          sourceEntityType: component.sourceEntityType ?? null,
          sourceEntityId: component.sourceEntityId ?? null,
          contentHash: decision.contentHash,
          charCount: component.content.length,
          estimatedTokens: decision.estimatedTokens,
          included: decision.included,
          exclusionReason: decision.exclusionReason,
          duplicateOfId: decision.duplicateOfId,
          metadata: decision.metadata,
        };
      })).onConflictDoNothing();
      return db.select().from(runContextComponents)
        .where(eq(runContextComponents.runId, runId))
        .orderBy(runContextComponents.ordinal);
    },

    listProjectMemory: async (projectId: string, includeArchived = false) => {
      await requireProject(db, projectId);
      const condition = includeArchived
        ? eq(projectMemoryItems.projectId, projectId)
        : and(
            eq(projectMemoryItems.projectId, projectId),
            eq(projectMemoryItems.status, "active"),
            or(isNull(projectMemoryItems.expiresAt), lt(sql`now()`, projectMemoryItems.expiresAt)),
          );
      const rows = await db.select().from(projectMemoryItems).where(condition).limit(1_000);
      const now = new Date();
      return rows.sort((left, right) => {
        const scoreDelta = projectMemoryScore(right, now) - projectMemoryScore(left, now);
        if (scoreDelta !== 0) return scoreDelta;
        return right.lastConfirmedAt.getTime() - left.lastConfirmedAt.getTime();
      });
    },

    createProjectMemory: async (projectId: string, input: ProjectMemoryCreateInput) => {
      const project = await requireProject(db, projectId);
      if (input.sourceIssueId) {
        const issue = await requireIssue(db, input.sourceIssueId);
        if (issue.projectId !== projectId) throw forbidden("Memory source task belongs to another project");
      }
      const contentHash = sha256(`${input.category}\n${input.text.trim()}`);
      const existing = await db.select().from(projectMemoryItems)
        .where(and(eq(projectMemoryItems.projectId, projectId), eq(projectMemoryItems.contentHash, contentHash)))
        .then((rows) => rows[0] ?? null);
      if (existing) {
        return db.update(projectMemoryItems).set({
          importance: Math.max(existing.importance, input.importance),
          confidence: Math.max(existing.confidence, input.confidence),
          status: "active",
          lastConfirmedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(projectMemoryItems.id, existing.id)).returning().then((rows) => rows[0]!);
      }
      return db.insert(projectMemoryItems).values({
        companyId: project.companyId,
        projectId,
        category: input.category,
        text: input.text.trim(),
        contentHash,
        importance: input.importance,
        confidence: input.confidence,
        sourceIssueId: input.sourceIssueId ?? null,
        sourceRunId: input.sourceRunId ?? null,
        supersedesId: input.supersedesId ?? null,
        expiresAt: input.expiresAt ?? null,
      }).returning().then((rows) => rows[0]!);
    },

    updateProjectMemory: async (projectId: string, memoryId: string, input: ProjectMemoryUpdateInput) => {
      const existing = await db.select().from(projectMemoryItems)
        .where(eq(projectMemoryItems.id, memoryId)).then((rows) => rows[0] ?? null);
      if (!existing || existing.projectId !== projectId) throw notFound("Project memory item not found");
      await requireProject(db, existing.projectId);
      const text = input.text?.trim() ?? existing.text;
      return db.update(projectMemoryItems).set({
        ...(input.text !== undefined ? { text, contentHash: sha256(`${existing.category}\n${text}`) } : {}),
        ...(input.importance !== undefined ? { importance: input.importance } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.confirm ? { lastConfirmedAt: new Date() } : {}),
        updatedAt: new Date(),
      }).where(eq(projectMemoryItems.id, memoryId)).returning().then((rows) => rows[0]!);
    },

    listTaskReviews: async (issueId: string) => {
      await requireIssue(db, issueId);
      return db.select().from(taskReviews).where(eq(taskReviews.issueId, issueId)).orderBy(desc(taskReviews.revision));
    },

    requestTaskReview: async (issueId: string, input: TaskReviewRequestInput, actor: LightExecutionActor) => {
      const issue = await requireIssue(db, issueId);
      const requesterAgentId = actor.actorType === "agent" ? actor.agentId : issue.assigneeAgentId;
      if (actor.actorType === "agent" && issue.assigneeAgentId !== actor.agentId) {
        throw forbidden("Only the assigned agent may submit this task for review");
      }
      let reviewerAgentId = input.reviewerAgentId ?? null;
      if (!reviewerAgentId && requesterAgentId) {
        const requester = await db.select({
          reportsTo: agents.reportsTo,
          runtimeConfig: agents.runtimeConfig,
        }).from(agents).where(eq(agents.id, requesterAgentId)).then((rows) => rows[0] ?? null);
        reviewerAgentId = requester?.reportsTo ?? null;
        if (!reviewerAgentId) {
          const lightReview = requester?.runtimeConfig && typeof requester.runtimeConfig === "object"
            ? (requester.runtimeConfig as Record<string, unknown>).lightReview
            : null;
          const configured = lightReview && typeof lightReview === "object" && !Array.isArray(lightReview)
            ? (lightReview as Record<string, unknown>).fallbackReviewerAgentIds
            : null;
          const configuredIds = Array.isArray(configured)
            ? configured.filter((value): value is string => typeof value === "string")
            : [];
          const fallbackAgents = await db.select({ id: agents.id, role: agents.role, status: agents.status })
            .from(agents).where(eq(agents.companyId, issue.companyId));
          const invokable = (status: string) => !["terminated", "pending_approval", "paused"].includes(status);
          reviewerAgentId = configuredIds.find((id) => fallbackAgents.some((agent) => agent.id === id && invokable(agent.status)))
            ?? fallbackAgents
              .filter((agent) => agent.id !== requesterAgentId && invokable(agent.status))
              .sort((left, right) =>
                lightReviewerRoleRank(left.role) - lightReviewerRoleRank(right.role)
                || left.id.localeCompare(right.id)
              )[0]?.id
            ?? null;
        }
      }
      if (reviewerAgentId) {
        const reviewer = await db.select({ companyId: agents.companyId, status: agents.status })
          .from(agents).where(eq(agents.id, reviewerAgentId)).then((rows) => rows[0] ?? null);
        if (!reviewer || reviewer.companyId !== issue.companyId || ["terminated", "pending_approval", "paused"].includes(reviewer.status)) {
          throw unprocessable("The selected reviewer is not an active agent in this company");
        }
        if (reviewerAgentId === requesterAgentId) throw unprocessable("An agent cannot review its own task");
      }
      const { config } = await requireLightCompany(db, issue.companyId);
      const review = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`light-review:${issueId}`}, 0))`);
        const pending = await tx.select().from(taskReviews).where(and(
          eq(taskReviews.issueId, issueId),
          eq(taskReviews.status, "pending"),
        )).orderBy(desc(taskReviews.revision)).limit(1).then((rows) => rows[0] ?? null);
        if (pending) return pending;
        const sourceRunId = input.sourceRunId ?? actor.runId;
        if (sourceRunId) {
          const existing = await tx.select().from(taskReviews).where(and(
            eq(taskReviews.issueId, issueId),
            eq(taskReviews.sourceRunId, sourceRunId),
          )).then((rows) => rows[0] ?? null);
          if (existing) return existing;
        }
        const revision = await tx.select({ value: sql<number>`coalesce(max(${taskReviews.revision}), 0) + 1` })
          .from(taskReviews).where(eq(taskReviews.issueId, issueId)).then((rows) => Number(rows[0]?.value ?? 1));
        if (revision > config.maxReviewCycles) {
          throw conflict("This task reached the configured review-cycle limit", { code: "review_cycle_limit" });
        }
        const row = await tx.insert(taskReviews).values({
          companyId: issue.companyId,
          issueId,
          revision,
          requestedByAgentId: requesterAgentId,
          reviewerAgentId,
          summary: input.summary,
          sourceRunId,
        }).returning().then((rows) => rows[0]!);
        await tx.update(issues).set({ status: "in_review", updatedAt: new Date() }).where(eq(issues.id, issueId));
        return row;
      });
      return review;
    },

    decideTaskReview: async (issueId: string, reviewId: string, input: TaskReviewDecisionInput, actor: LightExecutionActor) => {
      const review = await db.select().from(taskReviews).where(eq(taskReviews.id, reviewId)).then((rows) => rows[0] ?? null);
      if (!review || review.issueId !== issueId) throw notFound("Task review not found");
      const issue = await requireIssue(db, review.issueId);
      if (review.status !== "pending") throw conflict("This review has already been decided");
      if (actor.actorType === "agent" && review.reviewerAgentId && actor.agentId !== review.reviewerAgentId) {
        throw forbidden("This review is assigned to another agent");
      }
      const nextIssueStatus = input.decision === "accepted"
        ? "done"
        : input.decision === "changes_requested" ? "in_progress" : "blocked";
      return db.transaction(async (tx) => {
        const updated = await tx.update(taskReviews).set({
          status: input.decision,
          summary: input.summary,
          requiredChanges: input.requiredChanges,
          decidedRunId: input.decidedRunId ?? actor.runId,
          decidedByUserId: userId(actor),
          decidedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(eq(taskReviews.id, reviewId), eq(taskReviews.status, "pending")))
          .returning().then((rows) => rows[0] ?? null);
        if (!updated) throw conflict("This review was decided concurrently");
        const supersededRuns = await tx
          .update(heartbeatRuns)
          .set({
            status: "cancelled",
            finishedAt: new Date(),
            error: `Superseded by task review decision: ${input.decision}`,
            errorCode: "task_review_decision_superseded",
            updatedAt: new Date(),
          })
          .where(and(
            eq(heartbeatRuns.companyId, issue.companyId),
            inArray(heartbeatRuns.status, ["queued", "scheduled_retry"]),
            sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issue.id}`,
          ))
          .returning({ wakeupRequestId: heartbeatRuns.wakeupRequestId });
        const supersededWakeupIds = supersededRuns
          .map((run) => run.wakeupRequestId)
          .filter((id): id is string => Boolean(id));
        if (supersededWakeupIds.length > 0) {
          await tx
            .update(agentWakeupRequests)
            .set({
              status: "cancelled",
              finishedAt: new Date(),
              error: `Superseded by task review decision: ${input.decision}`,
              updatedAt: new Date(),
            })
            .where(inArray(agentWakeupRequests.id, supersededWakeupIds));
        }
        await tx.update(issues).set({ status: nextIssueStatus, updatedAt: new Date() }).where(eq(issues.id, issue.id));
        return updated;
      });
    },

    listHumanActions: async (companyId: string, status?: string) => {
      await requireLightCompany(db, companyId);
      const condition = status
        ? and(eq(humanActions.companyId, companyId), eq(humanActions.status, status))
        : eq(humanActions.companyId, companyId);
      return db.select().from(humanActions).where(condition).orderBy(desc(humanActions.createdAt));
    },

    createHumanAction: async (companyId: string, input: CreateHumanActionInput, actor: LightExecutionActor) => {
      const { config } = await requireLightCompany(db, companyId);
      if (!config.requireHumanApprovalForExternalEffects) {
        throw unprocessable("External-effect approvals are disabled for this company");
      }
      if (input.issueId) {
        const issue = await requireIssue(db, input.issueId);
        if (issue.companyId !== companyId) throw forbidden("Task belongs to another company");
      }
      if (input.approvalScope?.projectId && input.projectId && input.approvalScope.projectId !== input.projectId) {
        throw unprocessable("Approval scope project does not match the requested action project");
      }
      const amountCents = typeof input.payload.amountCents === "number" ? input.payload.amountCents : null;
      if (input.approvalScope?.maxAmountCents != null && amountCents != null && amountCents > input.approvalScope.maxAmountCents) {
        throw forbidden("Requested amount exceeds the approval scope");
      }
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`human-action:${companyId}:${input.idempotencyKey}`}, 0))`);
        const existing = await tx.select().from(humanActions).where(and(
          eq(humanActions.companyId, companyId), eq(humanActions.idempotencyKey, input.idempotencyKey),
        )).then((rows) => rows[0] ?? null);
        if (existing) return existing;
        const created = await tx.insert(humanActions).values({
          companyId,
          projectId: input.projectId ?? null,
          issueId: input.issueId ?? null,
          requestingAgentId: actor.actorType === "agent" ? actor.agentId : input.requestingAgentId ?? null,
          requestingRunId: input.requestingRunId ?? actor.runId,
          actionKind: input.actionKind,
          riskLevel: input.riskLevel,
          summary: input.summary,
          payload: { ...input.payload, ...(input.approvalScope ? { _approvalScope: input.approvalScope } : {}) },
          idempotencyKey: input.idempotencyKey,
          providerIdempotencyKey: input.providerIdempotencyKey ?? `paperclip:${companyId}:${input.idempotencyKey}`,
          expiresAt: input.expiresAt ?? null,
        }).returning().then((rows) => rows[0]!);
        if (input.issueId) {
          await tx.update(issues).set({
            status: "paused",
            pauseReason: "human_action",
            pausedAt: new Date(),
            updatedAt: new Date(),
          }).where(and(
            eq(issues.id, input.issueId),
            inArray(issues.status, ["backlog", "todo", "in_progress", "in_review", "blocked"]),
          ));
        }
        return created;
      });
    },

    decideHumanAction: async (companyId: string, actionId: string, input: DecideHumanActionInput, actor: LightExecutionActor) => {
      if (actor.actorType !== "user") throw forbidden("A human must decide this action");
      const status = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "cancelled";
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`human-action-decision:${actionId}`}, 0))`);
        const current = await tx.select().from(humanActions).where(and(
          eq(humanActions.id, actionId), eq(humanActions.companyId, companyId),
        )).then((rows) => rows[0] ?? null);
        if (!current) throw notFound("Human action not found");
        if (current.status !== "pending") {
          if (current.decision === input.decision) return current;
          throw conflict("This action has already been decided or expired");
        }
        const approvalScope = current.payload && typeof current.payload === "object"
          ? (current.payload as Record<string, unknown>)._approvalScope
          : null;
        if (approvalScope && typeof approvalScope === "object" && !Array.isArray(approvalScope)) {
          const scope = approvalScope as Record<string, unknown>;
          const allowedUserIds = Array.isArray(scope.allowedUserIds) ? scope.allowedUserIds : [];
          const allowedRoles = Array.isArray(scope.allowedRoles) ? scope.allowedRoles : [];
          const membership = await tx.select({ role: companyMemberships.membershipRole })
            .from(companyMemberships).where(and(
              eq(companyMemberships.companyId, companyId),
              eq(companyMemberships.principalType, "user"),
              eq(companyMemberships.principalId, actor.actorId),
              eq(companyMemberships.status, "active"),
            )).then((rows) => rows[0] ?? null);
          const userAllowed = allowedUserIds.length === 0 || allowedUserIds.includes(actor.actorId);
          const roleAllowed = allowedRoles.length === 0 || (membership?.role != null && allowedRoles.includes(membership.role));
          if (!userAllowed || !roleAllowed) throw forbidden("This human action is outside your approval scope");
        }
        const updated = await tx.update(humanActions).set({
          status,
          decision: input.decision,
          decisionNote: input.note ?? null,
          decidedByUserId: actor.actorId,
          decidedAt: new Date(),
          completedAt: status === "approved" ? null : new Date(),
          updatedAt: new Date(),
        }).where(and(eq(humanActions.id, actionId), eq(humanActions.status, "pending")))
          .returning().then((rows) => rows[0]!);
        if (current.issueId) {
          const issue = await tx.select().from(issues).where(eq(issues.id, current.issueId)).then((rows) => rows[0] ?? null);
          if (issue?.assigneeAgentId) {
            if (issue.status === "paused" && issue.pauseReason === "human_action") {
              await tx.update(issues).set({ status: "todo", pauseReason: null, pausedAt: null, updatedAt: new Date() })
                .where(eq(issues.id, issue.id));
            }
            await tx.insert(agentWakeupRequests).values({
              companyId,
              agentId: issue.assigneeAgentId,
              source: "human_action",
              triggerDetail: "decision",
              reason: `Human action ${input.decision}: ${current.summary}`,
              payload: { issueId: issue.id, humanActionId: current.id, decision: input.decision, note: input.note ?? null },
              requestedByActorType: "user",
              requestedByActorId: actor.actorId,
              idempotencyKey: `human-action-decision:${current.id}:${input.decision}`,
            }).onConflictDoNothing();
          }
        }
        return updated;
      });
    },

    claimHumanAction: async (companyId: string, actionId: string, input: ClaimHumanActionInput) => {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`human-action-execution:${actionId}`}, 0))`);
        const current = await tx.select().from(humanActions).where(and(
          eq(humanActions.id, actionId), eq(humanActions.companyId, companyId),
        )).then((rows) => rows[0] ?? null);
        if (!current) throw notFound("Human action not found");
        if (current.status === "executing" && current.executionClaim === input.executionClaim) return current;
        if (current.status !== "approved") throw conflict("This external action is not approved or has already been claimed", {
          code: "external_action_already_claimed",
        });
        return tx.update(humanActions).set({
          status: "executing",
          executionClaim: input.executionClaim,
          executingAt: new Date(),
          updatedAt: new Date(),
        }).where(and(eq(humanActions.id, actionId), eq(humanActions.status, "approved")))
          .returning().then((rows) => rows[0]!);
      });
    },

    completeHumanAction: async (companyId: string, actionId: string, input: CompleteHumanActionInput) => {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`human-action-execution:${actionId}`}, 0))`);
        const current = await tx.select().from(humanActions).where(and(
          eq(humanActions.id, actionId), eq(humanActions.companyId, companyId),
        )).then((rows) => rows[0] ?? null);
        if (!current) throw notFound("Human action not found");
        if (
          ["succeeded", "failed_safe", "failed_unknown"].includes(current.status)
          && current.executionClaim === input.executionClaim
          && current.status === input.outcome
        ) return current;
        if (current.status !== "executing" || current.executionClaim !== input.executionClaim) {
          throw conflict("Execution claim does not own this external action");
        }
        return tx.update(humanActions).set({
          status: input.outcome,
          receipt: input.receipt,
          completedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(humanActions.id, actionId),
          eq(humanActions.status, "executing"),
          eq(humanActions.executionClaim, input.executionClaim),
        )).returning().then((rows) => rows[0]!);
      });
    },

    reconcileHumanAction: async (companyId: string, actionId: string, input: ReconcileHumanActionInput, actor: LightExecutionActor) => {
      if (actor.actorType !== "user") throw forbidden("A human must reconcile an uncertain external action");
      const result = await db.update(humanActions).set({
        status: input.outcome,
        receipt: { ...input.receipt, reconciliationNote: input.note, reconciledByUserId: actor.actorId },
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(humanActions.id, actionId),
        eq(humanActions.companyId, companyId),
        eq(humanActions.status, "failed_unknown"),
      )).returning();
      if (!result[0]) throw conflict("Only an uncertain external action can be reconciled");
      return result[0];
    },

    actionCenter: async (companyId: string) => {
      await requireLightCompany(db, companyId);
      const [actions, legacyApprovals, reviews, failedTasks] = await Promise.all([
        db.select({ action: humanActions, issueIdentifier: issues.identifier, issueTitle: issues.title })
          .from(humanActions).leftJoin(issues, eq(humanActions.issueId, issues.id))
          .where(and(eq(humanActions.companyId, companyId), inArray(humanActions.status, ["pending", "approved", "failed_safe", "failed_unknown"])))
          .orderBy(desc(humanActions.createdAt)),
        db.select({ approval: approvals, issueId: issueApprovals.issueId, issueIdentifier: issues.identifier, issueTitle: issues.title })
          .from(approvals)
          .leftJoin(issueApprovals, eq(approvals.id, issueApprovals.approvalId))
          .leftJoin(issues, eq(issueApprovals.issueId, issues.id))
          .where(and(eq(approvals.companyId, companyId), inArray(approvals.status, ["pending", "revision_requested"])))
          .orderBy(desc(approvals.createdAt)),
        db.select({ review: taskReviews, issueIdentifier: issues.identifier, issueTitle: issues.title })
          .from(taskReviews).innerJoin(issues, eq(taskReviews.issueId, issues.id))
          .where(and(eq(taskReviews.companyId, companyId), eq(taskReviews.status, "pending")))
          .orderBy(desc(taskReviews.createdAt)),
        db.select().from(issues).where(and(eq(issues.companyId, companyId), eq(issues.status, "failed")))
          .orderBy(desc(issues.updatedAt)).limit(100),
      ]);
      return [
        ...actions.map(({ action, issueIdentifier, issueTitle }) => ({
          id: action.id, kind: "human_action" as const, title: `${action.actionKind.replaceAll("_", " ")} approval`,
          summary: action.summary, status: action.status, riskLevel: action.riskLevel, issueId: action.issueId,
          issueIdentifier, issueTitle, createdAt: action.createdAt,
          href: action.issueId ? `/${issueIdentifier?.split("-")[0] ?? ""}/issues/${issueIdentifier}` : "/actions",
          actions: action.status === "pending"
            ? ["approve", "reject", "comment"]
            : action.status === "failed_unknown" ? ["mark_succeeded", "mark_failed_safe", "comment"] : ["inspect"],
        })),
        ...legacyApprovals.map(({ approval, issueId, issueIdentifier, issueTitle }) => ({
          id: approval.id, kind: "approval" as const, title: `${approval.type.replaceAll("_", " ")} approval`,
          summary: typeof approval.payload.summary === "string"
            ? approval.payload.summary
            : "Review the request, then approve or reject it.",
          status: approval.status, riskLevel: null, issueId, issueIdentifier, issueTitle,
          createdAt: approval.createdAt, href: `/approvals/${approval.id}`, actions: ["approve", "reject", "comment"],
        })),
        ...reviews.map(({ review, issueIdentifier, issueTitle }) => ({
          id: review.id, kind: "review" as const, title: `Review ${issueIdentifier}`,
          summary: review.summary ?? "Review the task output and accept it or request precise changes.", status: review.status,
          riskLevel: null, issueId: review.issueId, issueIdentifier, issueTitle, createdAt: review.createdAt,
          href: issueIdentifier ? `/${issueIdentifier.split("-")[0]}/issues/${issueIdentifier}` : "/actions", actions: ["accept", "request_changes", "comment"],
        })),
        ...failedTasks.map((issue) => ({
          id: issue.id, kind: "failed_task" as const, title: `${issue.identifier} failed`,
          summary: issue.failureReason ?? issue.pauseReason ?? "Automatic retries were exhausted. Inspect the last run and choose the next action.",
          status: issue.status, riskLevel: null, issueId: issue.id, issueIdentifier: issue.identifier, issueTitle: issue.title,
          createdAt: issue.updatedAt, href: issue.identifier ? `/${issue.identifier.split("-")[0]}/issues/${issue.identifier}` : "/actions",
          actions: ["retry", "reassign", "cancel", "comment"],
        })),
      ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    },

    listConfigurationRevisions: async (companyId: string) => {
      await requireLightCompany(db, companyId);
      return db.select().from(lightConfigurationRevisions).where(and(
        eq(lightConfigurationRevisions.companyId, companyId),
        eq(lightConfigurationRevisions.scopeType, "company"),
        eq(lightConfigurationRevisions.scopeId, companyId),
      )).orderBy(desc(lightConfigurationRevisions.revision)).limit(100);
    },

    rollbackConfiguration: async (
      companyId: string,
      input: RollbackLightConfigurationInput,
      actor: LightExecutionActor,
    ) => {
      if (actor.actorType !== "user") throw forbidden("A human must roll back Light configuration");
      const source = await db.select().from(lightConfigurationRevisions).where(and(
        eq(lightConfigurationRevisions.companyId, companyId),
        eq(lightConfigurationRevisions.scopeType, "company"),
        eq(lightConfigurationRevisions.scopeId, companyId),
        eq(lightConfigurationRevisions.revision, input.revision),
      )).then((rows) => rows[0] ?? null);
      if (!source) throw notFound("Light configuration revision not found");
      const snapshot = source.snapshot as Record<string, unknown>;
      const executionProfile = snapshot.executionProfile === "light" ? "light" : "standard";
      const lightConfig = lightCompanyConfigSchema.parse(snapshot.lightConfig ?? {});
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`light-config:${companyId}`}, 0))`);
        await tx.update(companies).set({ executionProfile, lightConfig, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
        const revision = await tx.select({ value: sql<number>`coalesce(max(${lightConfigurationRevisions.revision}), 0) + 1` })
          .from(lightConfigurationRevisions).where(and(
            eq(lightConfigurationRevisions.scopeType, "company"),
            eq(lightConfigurationRevisions.scopeId, companyId),
          )).then((rows) => Number(rows[0]?.value ?? 1));
        return tx.insert(lightConfigurationRevisions).values({
          companyId,
          scopeType: "company",
          scopeId: companyId,
          revision,
          snapshot: { executionProfile, lightConfig },
          changeSummary: input.note ?? `Rolled back to revision ${input.revision}`,
          createdByActorType: actor.actorType,
          createdByActorId: actor.actorId,
        }).returning().then((rows) => rows[0]!);
      });
    },

    qualitySummary: async (companyId: string) => {
      const { config } = await requireLightCompany(db, companyId);
      const from = new Date(Date.now() - config.qualityAnalyticsWindowDays * 86_400_000);
      const [reviews, recentIssues, costs, runs, actions] = await Promise.all([
        db.select().from(taskReviews).where(and(
          eq(taskReviews.companyId, companyId),
          gte(taskReviews.createdAt, from),
        )),
        db.select({ id: issues.id, status: issues.status, updatedAt: issues.updatedAt })
          .from(issues).where(and(eq(issues.companyId, companyId), gte(issues.updatedAt, from))),
        db.select().from(costEvents).where(and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, from))),
        db.select({ id: heartbeatRuns.id, contextSnapshot: heartbeatRuns.contextSnapshot })
          .from(heartbeatRuns).where(and(eq(heartbeatRuns.companyId, companyId), gte(heartbeatRuns.createdAt, from))),
        db.select({ id: humanActions.id }).from(humanActions).where(and(
          eq(humanActions.companyId, companyId),
          gte(humanActions.createdAt, from),
        )),
      ]);
      const accepted = reviews.filter((review) => review.status === "accepted");
      const acceptedIssueIds = new Set(accepted.map((review) => review.issueId));
      const maxRevisionByIssue = new Map<string, number>();
      for (const review of reviews) {
        maxRevisionByIssue.set(review.issueId, Math.max(maxRevisionByIssue.get(review.issueId) ?? 0, review.revision));
      }
      const acceptedCosts = costs.filter((event) => event.issueId && acceptedIssueIds.has(event.issueId));
      const acceptedTokens = acceptedCosts.reduce(
        (sum, event) => sum + event.inputTokens + event.cachedInputTokens + event.outputTokens,
        0,
      );
      const fallbackRuns = runs.filter((run) => {
        const snapshot = run.contextSnapshot && typeof run.contextSnapshot === "object"
          ? run.contextSnapshot as Record<string, unknown>
          : {};
        const routing = snapshot.paperclipLightRouting && typeof snapshot.paperclipLightRouting === "object"
          ? snapshot.paperclipLightRouting as Record<string, unknown>
          : {};
        return typeof routing.selectedIndex === "number" && routing.selectedIndex > 0;
      }).length;
      const acceptedCount = acceptedIssueIds.size;
      const firstPassAccepted = accepted.filter((review) => review.revision === 1).length;
      const totalReviewCycles = [...acceptedIssueIds]
        .reduce((sum, issueId) => sum + (maxRevisionByIssue.get(issueId) ?? 0), 0);
      return {
        companyId,
        from,
        to: new Date(),
        windowDays: config.qualityAnalyticsWindowDays,
        acceptedTasks: acceptedCount,
        firstPassAccepted,
        firstPassAcceptanceRate: acceptedCount > 0 ? firstPassAccepted / acceptedCount : null,
        averageReviewCycles: acceptedCount > 0 ? totalReviewCycles / acceptedCount : null,
        failedTasks: recentIssues.filter((issue) => issue.status === "failed").length,
        fallbackRuns,
        humanInterventions: actions.length,
        acceptedTaskTokens: acceptedTokens,
        acceptedTaskCostCents: acceptedCosts.reduce((sum, event) => sum + event.costCents, 0),
        tokensPerAcceptedTask: acceptedCount > 0 ? Math.round(acceptedTokens / acceptedCount) : null,
        costCentsPerAcceptedTask: acceptedCount > 0
          ? Math.round(acceptedCosts.reduce((sum, event) => sum + event.costCents, 0) / acceptedCount)
          : null,
      };
    },

    migrationPreview: async (companyId: string) => {
      const { company, config } = await requireLightCompany(db, companyId);
      const companyAgents = await db.select().from(agents).where(eq(agents.companyId, companyId));
      const companyProjects = await db.select().from(projects).where(eq(projects.companyId, companyId));
      const projectIds = companyProjects.map((project) => project.id);
      const workspaces = projectIds.length > 0
        ? await db.select().from(projectWorkspaces).where(inArray(projectWorkspaces.projectId, projectIds))
        : [];
      const findings = [
        ...companyAgents.filter((agent) => !agent.reportsTo && agent.role !== "ceo").map((agent) => ({
          severity: "info", code: "agent_without_manager", entityType: "agent", entityId: agent.id,
          message: `${agent.name} has no manager; review falls back to another active reviewer, then Action Center.`,
        })),
        ...companyAgents.filter((agent) => {
          const prompt = agent.adapterConfig && typeof agent.adapterConfig === "object"
            ? (agent.adapterConfig as Record<string, unknown>).promptTemplate
            : null;
          return typeof prompt === "string" && estimateContextTokens(prompt) > config.contextComponentBudgets.protocol;
        }).map((agent) => ({
          severity: "warning", code: "oversized_agent_prompt", entityType: "agent", entityId: agent.id,
          message: `${agent.name}'s prompt exceeds the protocol component budget and should be distilled.`,
        })),
        ...companyAgents.filter((agent) => {
          const runtime = agent.runtimeConfig && typeof agent.runtimeConfig === "object"
            ? agent.runtimeConfig as Record<string, unknown>
            : {};
          const heartbeat = runtime.heartbeat && typeof runtime.heartbeat === "object"
            ? runtime.heartbeat as Record<string, unknown>
            : {};
          return heartbeat.enabled === true || typeof heartbeat.intervalSeconds === "number";
        }).map((agent) => ({
          severity: "error", code: "periodic_heartbeat_enabled", entityType: "agent", entityId: agent.id,
          message: `${agent.name} still has a periodic heartbeat configured; Light must stay event-driven.`,
        })),
        ...companyAgents.filter((agent) => !(agent.runtimeConfig as Record<string, unknown> | null)?.lightRouting).map((agent) => ({
          severity: "info", code: "agent_routing_inherited", entityType: "agent", entityId: agent.id,
          message: `${agent.name} inherits its adapter model and has no explicit Light fallback policy.`,
        })),
        ...companyProjects.flatMap((project) => {
          const rawPolicy = project.executionWorkspacePolicy && typeof project.executionWorkspacePolicy === "object"
            ? (project.executionWorkspacePolicy as Record<string, unknown>).lightRepository
            : null;
          const parsed = lightRepositoryPolicySchema.safeParse(rawPolicy);
          if (!parsed.success || !parsed.data.enabled) return [{
            severity: "warning", code: "repository_broker_disabled", entityType: "project", entityId: project.id,
            message: `${project.name} does not use file reservations and brokered Git operations.`,
          }];
          const projectFindings: Array<{ severity: string; code: string; entityType: string; entityId: string; message: string }> = [];
          if (!workspaces.some((workspace) => workspace.projectId === project.id && workspace.cwd)) projectFindings.push({
            severity: "error", code: "repository_workspace_missing", entityType: "project", entityId: project.id,
            message: `${project.name} has no local workspace for the shared-repository broker.`,
          });
          if (parsed.data.enforcement !== "strict") projectFindings.push({
            severity: "warning", code: "repository_advisory_only", entityType: "project", entityId: project.id,
            message: `${project.name} uses advisory file locking; cross-agent writes are not strictly blocked.`,
          });
          if (!parsed.data.validationCommand && parsed.data.validationCommands.length === 0) projectFindings.push({
            severity: "warning", code: "repository_validation_missing", entityType: "project", entityId: project.id,
            message: `${project.name} has no project validation command; only git diff --check will run.`,
          });
          return projectFindings;
        }),
        ...(config.modelRegistry.length === 0 ? [{
          severity: "info", code: "model_registry_empty", entityType: "company", entityId: companyId,
          message: "The model registry is empty; agents keep fixed adapter models and auto cost/capability routing is unavailable.",
        }] : []),
      ];
      return {
        companyId, executionProfile: company.executionProfile,
        counts: { agents: companyAgents.length, projects: companyProjects.length, blockers: findings.filter((f) => f.severity === "error").length, warnings: findings.filter((f) => f.severity === "warning").length },
        ready: findings.every((finding) => finding.severity !== "error"), findings,
      };
    },
  };
}

export function lightReviewerRoleRank(role: string | null) {
  switch (role?.trim().toLowerCase()) {
    case "ceo": return 0;
    case "cto": return 1;
    case "manager":
    case "director":
    case "head":
    case "lead": return 2;
    case "engineer": return 3;
    case "designer": return 4;
    case "general": return 5;
    default: return 6;
  }
}
