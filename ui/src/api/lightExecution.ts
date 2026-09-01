import type {
  HumanAction,
  FileReservation,
  LightActionCenterItem,
  LightExecutionEvent,
  ProjectMemoryItem,
  RunContextComponent,
  TaskReview,
  TaskCheckpoint,
} from "@paperclipai/shared";
import { api } from "./client";

export type LightMigrationFinding = {
  severity: "error" | "warning" | "info";
  code: string;
  entityType: string;
  entityId: string;
  message: string;
};

export type LightMigrationPreview = {
  companyId: string;
  executionProfile: string;
  counts: { agents: number; projects: number; blockers: number; warnings: number };
  ready: boolean;
  findings: LightMigrationFinding[];
};

export type LightConfigurationRevision = {
  id: string;
  revision: number;
  snapshot: Record<string, unknown>;
  changeSummary: string | null;
  createdByActorType: string;
  createdByActorId: string;
  createdAt: Date;
};

export type LightQualitySummary = {
  windowDays: number;
  acceptedTasks: number;
  firstPassAccepted: number;
  firstPassAcceptanceRate: number | null;
  averageReviewCycles: number | null;
  failedTasks: number;
  fallbackRuns: number;
  humanInterventions: number;
  acceptedTaskTokens: number;
  acceptedTaskCostCents: number;
  tokensPerAcceptedTask: number | null;
  costCentsPerAcceptedTask: number | null;
};

export const lightExecutionApi = {
  actionCenter: (companyId: string) =>
    api.get<LightActionCenterItem[]>(`/companies/${companyId}/light/action-center`),
  actions: (companyId: string, status?: string) =>
    api.get<HumanAction[]>(`/companies/${companyId}/light/actions${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  decideAction: (companyId: string, actionId: string, decision: "approve" | "reject" | "cancel", note?: string) =>
    api.post<HumanAction>(`/companies/${companyId}/light/actions/${actionId}/decision`, { decision, note }),
  reconcileAction: (
    companyId: string,
    actionId: string,
    outcome: "succeeded" | "failed_safe",
    note: string,
  ) => api.post<HumanAction>(`/companies/${companyId}/light/actions/${actionId}/reconcile`, {
    outcome,
    note,
    receipt: { source: "action_center" },
  }),
  migrationPreview: (companyId: string) =>
    api.get<LightMigrationPreview>(`/companies/${companyId}/light/migration-preview`),
  configurationRevisions: (companyId: string) =>
    api.get<LightConfigurationRevision[]>(`/companies/${companyId}/light/config-revisions`),
  rollbackConfiguration: (companyId: string, revision: number, note?: string) =>
    api.post<LightConfigurationRevision>(`/companies/${companyId}/light/config-revisions/rollback`, { revision, note }),
  qualitySummary: (companyId: string) =>
    api.get<LightQualitySummary>(`/companies/${companyId}/light/quality-summary`),
  executionEvents: (companyId: string, issueId?: string) =>
    api.get<LightExecutionEvent[]>(`/companies/${companyId}/light/execution-events${issueId ? `?issueId=${encodeURIComponent(issueId)}` : ""}`),
  runContext: (runId: string) =>
    api.get<RunContextComponent[]>(`/heartbeat-runs/${runId}/light/context`),
  reviews: (issueId: string) => api.get<TaskReview[]>(`/issues/${issueId}/light/reviews`),
  decideReview: (
    issueId: string,
    reviewId: string,
    decision: "accepted" | "changes_requested" | "blocked" | "cancelled",
    summary: string,
    requiredChanges: string[] = [],
  ) => api.post<TaskReview>(`/issues/${issueId}/light/reviews/${reviewId}/decision`, {
    decision,
    summary,
    requiredChanges,
  }),
  projectMemory: (projectId: string) => api.get<ProjectMemoryItem[]>(`/projects/${projectId}/light/memory`),
  checkpoints: (projectId: string, issueId: string) =>
    api.get<TaskCheckpoint[]>(`/projects/${projectId}/light/checkpoints?issueId=${encodeURIComponent(issueId)}`),
  fileReservations: (projectId: string, issueId: string) =>
    api.get<FileReservation[]>(`/projects/${projectId}/file-reservations?issueId=${encodeURIComponent(issueId)}`),
};
