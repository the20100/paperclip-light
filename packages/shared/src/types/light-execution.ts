export type FileReservationStatus = "active" | "waiting" | "orphaned" | "released" | "cancelled";
export type RepositoryOperationKind = "status" | "diff" | "validate" | "fetch" | "sync" | "commit" | "merge" | "push";
export type RepositoryOperationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type LightExecutionEventStatus = "pending" | "claimed" | "dispatched" | "completed" | "cancelled" | "conflict";
export type TaskReviewStatus = "pending" | "accepted" | "changes_requested" | "blocked" | "cancelled";
export type ProjectMemoryStatus = "active" | "superseded" | "expired" | "archived";
export type HumanActionStatus = "pending" | "approved" | "rejected" | "executing" | "succeeded" | "failed_safe" | "failed_unknown" | "failed" | "cancelled" | "expired";
export type HumanActionKind = "email" | "payment" | "publication" | "deployment" | "deletion" | "account_creation" | "secret_change" | "other";

export interface FileReservation {
  id: string;
  requestId: string;
  companyId: string;
  projectId: string;
  projectWorkspaceId: string;
  workspaceScopeKey: string;
  issueId: string;
  agentId: string;
  runId: string | null;
  path: string;
  normalizedPath: string;
  status: FileReservationStatus;
  blockedByReservationId: string | null;
  leaseExpiresAt: Date | null;
  lastRenewedAt: Date | null;
  releasedAt: Date | null;
  releaseReason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileReservationConflict {
  path: string;
  heldPath: string;
  reservationId: string;
  issueId: string;
  agentId: string;
  status: "active" | "orphaned";
  leaseExpiresAt: Date | null;
}

export interface FileReservationResult {
  requestId: string;
  status: "active" | "waiting";
  reservations: FileReservation[];
  conflicts: FileReservationConflict[];
}

export interface RepositoryOperation {
  id: string;
  companyId: string;
  projectId: string;
  projectWorkspaceId: string;
  workspaceScopeKey: string;
  issueId: string;
  agentId: string;
  runId: string | null;
  kind: RepositoryOperationKind;
  status: RepositoryOperationStatus;
  paths: string[] | null;
  targetBranch: string | null;
  commitSha: string | null;
  exitCode: string | null;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskCheckpoint {
  id: string;
  companyId: string;
  projectId: string;
  projectWorkspaceId: string;
  issueId: string;
  agentId: string;
  runId: string | null;
  kind: string;
  status: "available" | "restored" | "discarded" | "conflict";
  baseSha: string | null;
  paths: string[];
  patchStore: string | null;
  patchRef: string | null;
  patchSha256: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  restoredAt: Date | null;
  discardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LightExecutionEvent {
  id: string;
  companyId: string;
  projectId: string | null;
  issueId: string;
  targetAgentId: string;
  runId: string | null;
  kind: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: LightExecutionEventStatus;
  claimedAt: Date | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskReview {
  id: string;
  companyId: string;
  issueId: string;
  revision: number;
  requestedByAgentId: string | null;
  reviewerAgentId: string | null;
  status: TaskReviewStatus;
  summary: string | null;
  requiredChanges: string[];
  sourceRunId: string | null;
  decidedRunId: string | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemoryItem {
  id: string;
  companyId: string;
  projectId: string;
  category: string;
  text: string;
  contentHash: string;
  importance: number;
  confidence: number;
  sourceIssueId: string | null;
  sourceRunId: string | null;
  supersedesId: string | null;
  lastConfirmedAt: Date;
  expiresAt: Date | null;
  status: ProjectMemoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface HumanAction {
  id: string;
  companyId: string;
  projectId: string | null;
  issueId: string | null;
  requestingAgentId: string | null;
  requestingRunId: string | null;
  actionKind: HumanActionKind;
  riskLevel: "medium" | "high" | "critical";
  summary: string;
  payload: Record<string, unknown>;
  resolverPolicy: "human_only";
  idempotencyKey: string;
  providerIdempotencyKey: string;
  status: HumanActionStatus;
  decision: string | null;
  decisionNote: string | null;
  decidedByUserId: string | null;
  executionClaim: string | null;
  receipt: Record<string, unknown> | null;
  expiresAt: Date | null;
  decidedAt: Date | null;
  executingAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunContextComponent {
  id: string;
  companyId: string;
  runId: string;
  ordinal: number;
  componentKind: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  contentHash: string;
  charCount: number;
  estimatedTokens: number;
  included: boolean;
  exclusionReason: string | null;
  duplicateOfId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface LightActionCenterItem {
  id: string;
  kind: "human_action" | "approval" | "failed_task" | "review";
  title: string;
  summary: string;
  status: string;
  riskLevel: string | null;
  issueId: string | null;
  issueIdentifier: string | null;
  issueTitle: string | null;
  createdAt: Date;
  href: string;
  actions: string[];
}
