import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";
import { projects } from "./projects.js";
import { projectWorkspaces } from "./project_workspaces.js";

export const fileReservations = pgTable(
  "file_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    projectWorkspaceId: uuid("project_workspace_id")
      .notNull()
      .references(() => projectWorkspaces.id, { onDelete: "cascade" }),
    workspaceScopeKey: text("workspace_scope_key").notNull(),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    path: text("path").notNull(),
    normalizedPath: text("normalized_path").notNull(),
    status: text("status").notNull().default("active"),
    blockedByReservationId: uuid("blocked_by_reservation_id").references(
      (): AnyPgColumn => fileReservations.id,
      { onDelete: "set null" },
    ),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastRenewedAt: timestamp("last_renewed_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectStatusPathIdx: index("file_reservations_project_status_path_idx").on(
      table.projectId,
      table.status,
      table.normalizedPath,
    ),
    issueStatusIdx: index("file_reservations_issue_status_idx").on(table.issueId, table.status),
    requestIdx: index("file_reservations_request_idx").on(table.requestId),
    activeExactPathUq: uniqueIndex("file_reservations_active_exact_path_uq")
      .on(table.companyId, table.workspaceScopeKey, table.normalizedPath)
      .where(sql`${table.status} in ('active', 'orphaned')`),
  }),
);

export const repositoryOperations = pgTable(
  "repository_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    projectWorkspaceId: uuid("project_workspace_id")
      .notNull()
      .references(() => projectWorkspaces.id, { onDelete: "cascade" }),
    workspaceScopeKey: text("workspace_scope_key").notNull(),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    paths: jsonb("paths").$type<string[]>(),
    targetBranch: text("target_branch"),
    commitSha: text("commit_sha"),
    exitCode: text("exit_code"),
    stdoutExcerpt: text("stdout_excerpt"),
    stderrExcerpt: text("stderr_excerpt"),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectCreatedIdx: index("repository_operations_project_created_idx").on(table.projectId, table.createdAt),
    issueCreatedIdx: index("repository_operations_issue_created_idx").on(table.issueId, table.createdAt),
    activeWorkspaceUq: uniqueIndex("repository_operations_active_workspace_uq")
      .on(table.companyId, table.workspaceScopeKey)
      .where(sql`${table.status} in ('queued', 'running')`),
  }),
);

export const taskCheckpoints = pgTable(
  "task_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    projectWorkspaceId: uuid("project_workspace_id")
      .notNull()
      .references(() => projectWorkspaces.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("working_diff"),
    status: text("status").notNull().default("available"),
    baseSha: text("base_sha"),
    paths: jsonb("paths").$type<string[]>().notNull().default([]),
    patchStore: text("patch_store"),
    patchRef: text("patch_ref"),
    patchSha256: text("patch_sha256"),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueCreatedIdx: index("task_checkpoints_issue_created_idx").on(table.issueId, table.createdAt),
    runCreatedIdx: index("task_checkpoints_run_created_idx").on(table.runId, table.createdAt),
  }),
);

export const lightExecutionEvents = pgTable(
  "light_execution_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    targetAgentId: uuid("target_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("pending"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("light_execution_events_company_created_idx").on(table.companyId, table.createdAt),
    issueCreatedIdx: index("light_execution_events_issue_created_idx").on(table.issueId, table.createdAt),
    statusCreatedIdx: index("light_execution_events_status_created_idx").on(table.companyId, table.status, table.createdAt),
    companyIdempotencyUq: uniqueIndex("light_execution_events_company_idempotency_uq")
      .on(table.companyId, table.idempotencyKey),
    runUq: uniqueIndex("light_execution_events_run_uq").on(table.runId).where(sql`${table.runId} is not null`),
  }),
);

export const taskReviews = pgTable(
  "task_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    reviewerAgentId: uuid("reviewer_agent_id").references(() => agents.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    summary: text("summary"),
    requiredChanges: jsonb("required_changes").$type<string[]>().notNull().default([]),
    sourceRunId: uuid("source_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    decidedRunId: uuid("decided_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    decidedByUserId: text("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueRevisionUq: uniqueIndex("task_reviews_issue_revision_uq").on(table.issueId, table.revision),
    reviewerStatusIdx: index("task_reviews_reviewer_status_idx").on(table.companyId, table.reviewerAgentId, table.status),
    issueStatusIdx: index("task_reviews_issue_status_idx").on(table.issueId, table.status),
  }),
);

export const projectMemoryItems = pgTable(
  "project_memory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    text: text("text").notNull(),
    contentHash: text("content_hash").notNull(),
    importance: integer("importance").notNull().default(50),
    confidence: integer("confidence").notNull().default(100),
    sourceIssueId: uuid("source_issue_id").references(() => issues.id, { onDelete: "set null" }),
    sourceRunId: uuid("source_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => projectMemoryItems.id,
      { onDelete: "set null" },
    ),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectStatusImportanceIdx: index("project_memory_items_project_status_importance_idx")
      .on(table.projectId, table.status, table.importance, table.lastConfirmedAt),
    projectHashUq: uniqueIndex("project_memory_items_project_hash_uq").on(table.projectId, table.contentHash),
  }),
);

export const humanActions = pgTable(
  "human_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    requestingAgentId: uuid("requesting_agent_id").references(() => agents.id, { onDelete: "set null" }),
    requestingRunId: uuid("requesting_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    actionKind: text("action_kind").notNull(),
    riskLevel: text("risk_level").notNull().default("high"),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    resolverPolicy: text("resolver_policy").notNull().default("human_only"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerIdempotencyKey: text("provider_idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    decision: text("decision"),
    decisionNote: text("decision_note"),
    decidedByUserId: text("decided_by_user_id"),
    executionClaim: text("execution_claim"),
    receipt: jsonb("receipt").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executingAt: timestamp("executing_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusCreatedIdx: index("human_actions_company_status_created_idx")
      .on(table.companyId, table.status, table.createdAt),
    issueCreatedIdx: index("human_actions_issue_created_idx").on(table.issueId, table.createdAt),
    companyIdempotencyUq: uniqueIndex("human_actions_company_idempotency_uq")
      .on(table.companyId, table.idempotencyKey),
    providerIdempotencyUq: uniqueIndex("human_actions_provider_idempotency_uq")
      .on(table.companyId, table.providerIdempotencyKey),
  }),
);

export const lightConfigurationRevisions = pgTable(
  "light_configuration_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id").notNull(),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
    changeSummary: text("change_summary"),
    createdByActorType: text("created_by_actor_type").notNull().default("system"),
    createdByActorId: text("created_by_actor_id").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeRevisionUq: uniqueIndex("light_configuration_revisions_scope_revision_uq")
      .on(table.scopeType, table.scopeId, table.revision),
    companyScopeCreatedIdx: index("light_configuration_revisions_company_scope_created_idx")
      .on(table.companyId, table.scopeType, table.scopeId, table.createdAt),
  }),
);

export const runContextComponents = pgTable(
  "run_context_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    componentKind: text("component_kind").notNull(),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: text("source_entity_id"),
    contentHash: text("content_hash").notNull(),
    charCount: integer("char_count").notNull().default(0),
    estimatedTokens: integer("estimated_tokens").notNull().default(0),
    included: boolean("included").notNull().default(true),
    exclusionReason: text("exclusion_reason"),
    duplicateOfId: uuid("duplicate_of_id").references(
      (): AnyPgColumn => runContextComponents.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runOrdinalUq: uniqueIndex("run_context_components_run_ordinal_uq").on(table.runId, table.ordinal),
    runKindIdx: index("run_context_components_run_kind_idx").on(table.runId, table.componentKind),
    companyCreatedIdx: index("run_context_components_company_created_idx").on(table.companyId, table.createdAt),
  }),
);
