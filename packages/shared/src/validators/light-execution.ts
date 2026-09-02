import { z } from "zod";

export const executionProfileSchema = z.enum(["standard", "light"]);

export const lightModelProfileSchema = z.object({
  provider: z.string().trim().min(1).max(128),
  modelId: z.string().trim().min(1).max(255),
  // Paperclip adapter that executes this model (claude_local, codex_local, opencode_local, ...).
  // Null keeps the agent's own adapter; Light routing switches the run's adapter when this differs.
  adapterType: z.string().trim().min(1).max(64).nullable().optional(),
  displayName: z.string().trim().min(1).max(255),
  contextWindowTokens: z.number().int().min(1_000).max(20_000_000).nullable().default(null),
  maxOutputTokens: z.number().int().min(1).max(2_000_000).nullable().default(null),
  capabilities: z.array(z.string().trim().min(1).max(128)).max(64).default([]),
  supportsTools: z.boolean().default(false),
  supportsStructuredOutput: z.boolean().default(false),
  supportsVision: z.boolean().default(false),
  supportsSessionResume: z.boolean().default(false),
  executionLocation: z.enum(["local", "remote"]).default("remote"),
  inputPricePerMillion: z.number().min(0).nullable().default(null),
  cachedInputPricePerMillion: z.number().min(0).nullable().default(null),
  outputPricePerMillion: z.number().min(0).nullable().default(null),
  enabled: z.boolean().default(true),
  health: z.enum(["unknown", "available", "degraded", "unavailable"]).default("unknown"),
  healthReason: z.string().trim().max(1_000).nullable().default(null),
  lastCheckedAt: z.coerce.date().nullable().default(null),
  qualityScore: z.number().min(0).max(100).default(50),
}).strict();

export const lightContextComponentBudgetsSchema = z.object({
  protocol: z.number().int().min(100).max(16_000).default(700),
  projectBrief: z.number().int().min(0).max(32_000).default(800),
  projectMemory: z.number().int().min(0).max(32_000).default(1_500),
  task: z.number().int().min(500).max(128_000).default(4_000),
  eventDelta: z.number().int().min(250).max(32_000).default(1_500),
  recentComments: z.number().int().min(0).max(32_000).default(1_000),
  continuationSummary: z.number().int().min(0).max(32_000).default(1_000),
  skillManifest: z.number().int().min(0).max(16_000).default(400),
  selectedSkills: z.number().int().min(0).max(128_000).default(4_000),
  reservedOutput: z.number().int().min(250).max(128_000).default(2_000),
}).strict();

export const lightCompanyConfigSchema = z
  .object({
    maxConcurrentRuns: z.number().int().min(1).max(256).default(4),
    maxTaskDepth: z.number().int().min(1).max(8).default(3),
    maxChildrenPerTask: z.number().int().min(1).max(100).default(12),
    maxTasksPerTree: z.number().int().min(2).max(1_000).default(50),
    technicalRetryLimit: z.number().int().min(0).max(10).default(2),
    maxReviewCycles: z.number().int().min(1).max(10).default(10),
    maxCrossAgentMentionsPerTree: z.number().int().min(0).max(100).default(5),
    taskSessionIsolation: z.boolean().default(true),
    maxSessionRuns: z.number().int().min(1).max(100).default(6),
    maxSessionInputTokens: z.number().int().min(1_000).max(2_000_000).default(100_000),
    maxSessionAgeHours: z.number().int().min(1).max(720).default(24),
    routineConcurrencyPolicy: z.enum(["coalesce_if_active", "always_enqueue", "skip_if_active"]).default("skip_if_active"),
    routineCatchUpPolicy: z.enum(["skip_missed", "enqueue_missed_with_cap"]).default("skip_missed"),
    logRetentionDays: z.number().int().min(1).max(365).default(30),
    contextTokenBudget: z.number().int().min(1_000).max(256_000).default(16_000),
    projectMemoryTokenBudget: z.number().int().min(256).max(32_000).default(2_000),
    contextComponentBudgets: lightContextComponentBudgetsSchema.default(() => ({
      protocol: 700,
      projectBrief: 800,
      projectMemory: 1_500,
      task: 4_000,
      eventDelta: 1_500,
      recentComments: 1_000,
      continuationSummary: 1_000,
      skillManifest: 400,
      selectedSkills: 4_000,
      reservedOutput: 2_000,
    })),
    deterministicHealthCheckSeconds: z.number().int().min(30).max(86_400).default(300),
    requireHumanApprovalForExternalEffects: z.boolean().default(true),
    allowAgentCreationWithoutApproval: z.boolean().default(false),
    modelRegistry: z.array(lightModelProfileSchema).max(500).default([]),
    providerHealthTtlSeconds: z.number().int().min(30).max(86_400).default(300),
    qualityAnalyticsWindowDays: z.number().int().min(1).max(365).default(30),
  })
  .strict();

export const lightRepositoryPolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    enforcement: z.enum(["strict", "advisory"]).default("strict"),
    activeBranch: z.string().min(1).max(255).default("main"),
    allowedPushBranches: z.array(z.string().min(1).max(255)).max(32).default(["main"]),
    allowedMergeTargets: z.array(z.string().min(1).max(255)).max(32).default(["main"]),
    remoteName: z.string().min(1).max(128).default("origin"),
    validationCommand: z.string().min(1).max(8_192).optional().nullable(),
    validationCommands: z.array(z.string().trim().min(1).max(8_192)).max(20).default([]),
    reservationLeaseSeconds: z.number().int().min(30).max(86_400).default(900),
    maxReservedFilesPerTask: z.number().int().min(1).max(2_000).default(100),
    requireCleanValidationBarrier: z.boolean().default(true),
    requireHumanApprovalForDeploy: z.boolean().default(true),
    allowAgentCommit: z.boolean().default(true),
    allowAgentPush: z.boolean().default(true),
    allowAgentMerge: z.boolean().default(false),
    requireHumanApprovalForMerge: z.boolean().default(true),
    ephemeralWriteRoots: z.array(z.string().trim().min(1).max(4_096)).max(32).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.allowedPushBranches.includes(value.activeBranch)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedPushBranches"],
        message: "allowedPushBranches must include activeBranch",
      });
    }
  });

export const reserveProjectFilesSchema = z
  .object({
    issueId: z.string().guid(),
    paths: z.array(z.string().min(1).max(4_096)).min(1).max(2_000),
    agentId: z.string().guid().optional(),
    runId: z.string().guid().optional().nullable(),
    leaseSeconds: z.number().int().min(30).max(86_400).optional(),
  })
  .strict();

export const renewProjectFilesSchema = z
  .object({
    issueId: z.string().guid(),
    runId: z.string().guid().optional().nullable(),
    leaseSeconds: z.number().int().min(30).max(86_400).optional(),
  })
  .strict();

export const releaseProjectFilesSchema = z
  .object({
    issueId: z.string().guid(),
    paths: z.array(z.string().min(1).max(4_096)).min(1).max(2_000).optional(),
    runId: z.string().guid().optional().nullable(),
    force: z.boolean().optional().default(false),
  })
  .strict();

export const repositoryOperationSchema = z
  .object({
    issueId: z.string().guid(),
    kind: z.enum(["status", "diff", "validate", "fetch", "sync", "commit", "merge", "push"]),
    paths: z.array(z.string().min(1).max(4_096)).max(2_000).optional(),
    message: z.string().min(1).max(4_096).optional(),
    targetBranch: z.string().min(1).max(255).optional(),
    humanActionId: z.string().guid().optional().nullable(),
    runId: z.string().guid().optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "commit" && !value.message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Commit message is required" });
    }
    if (value.kind === "push" && !value.targetBranch) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetBranch"], message: "Target branch is required" });
    }
    if (value.kind === "merge" && !value.targetBranch) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetBranch"], message: "Merge target branch is required" });
    }
  });

export const lightExecutionEventStatusSchema = z.enum([
  "pending", "claimed", "dispatched", "completed", "cancelled", "conflict",
]);

export const taskReviewRequestSchema = z.object({
  reviewerAgentId: z.string().guid().optional().nullable(),
  summary: z.string().trim().min(1).max(8_000),
  sourceRunId: z.string().guid().optional().nullable(),
}).strict();

export const taskReviewDecisionSchema = z.object({
  decision: z.enum(["accepted", "changes_requested", "blocked", "cancelled"]),
  summary: z.string().trim().min(1).max(8_000),
  requiredChanges: z.array(z.string().trim().min(1).max(2_000)).max(20).default([]),
  decidedRunId: z.string().guid().optional().nullable(),
}).strict();

export const projectMemoryCreateSchema = z.object({
  category: z.enum(["decision", "constraint", "convention", "fact", "preference", "warning"]),
  text: z.string().trim().min(1).max(8_000),
  importance: z.number().int().min(0).max(100).default(50),
  confidence: z.number().int().min(0).max(100).default(100),
  sourceIssueId: z.string().guid().optional().nullable(),
  sourceRunId: z.string().guid().optional().nullable(),
  supersedesId: z.string().guid().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
}).strict();

export const projectMemoryUpdateSchema = z.object({
  text: z.string().trim().min(1).max(8_000).optional(),
  importance: z.number().int().min(0).max(100).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  status: z.enum(["active", "superseded", "expired", "archived"]).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  confirm: z.boolean().optional(),
}).strict();

export const humanActionKindSchema = z.enum([
  "email", "payment", "publication", "deployment", "deletion", "account_creation", "secret_change", "other",
]);

export const createHumanActionSchema = z.object({
  projectId: z.string().guid().optional().nullable(),
  issueId: z.string().guid().optional().nullable(),
  requestingAgentId: z.string().guid().optional().nullable(),
  requestingRunId: z.string().guid().optional().nullable(),
  actionKind: humanActionKindSchema,
  riskLevel: z.enum(["medium", "high", "critical"]).default("high"),
  summary: z.string().trim().min(1).max(2_000),
  payload: z.record(z.string(), z.unknown()).default({}),
  approvalScope: z.object({
    projectId: z.string().guid().optional().nullable(),
    allowedUserIds: z.array(z.string().trim().min(1)).max(100).default([]),
    allowedRoles: z.array(z.string().trim().min(1).max(128)).max(20).default([]),
    environment: z.string().trim().min(1).max(128).optional().nullable(),
    maxAmountCents: z.number().int().nonnegative().optional().nullable(),
  }).strict().optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(512),
  providerIdempotencyKey: z.string().trim().min(1).max(512).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
}).strict();

export const decideHumanActionSchema = z.object({
  decision: z.enum(["approve", "reject", "cancel"]),
  note: z.string().trim().max(4_000).optional().nullable(),
}).strict();

export const claimHumanActionSchema = z.object({
  executionClaim: z.string().trim().min(16).max(512),
}).strict();

export const completeHumanActionSchema = z.object({
  executionClaim: z.string().trim().min(16).max(512),
  outcome: z.enum(["succeeded", "failed_safe", "failed_unknown"]),
  receipt: z.record(z.string(), z.unknown()),
}).strict();

export const reconcileHumanActionSchema = z.object({
  outcome: z.enum(["succeeded", "failed_safe"]),
  note: z.string().trim().min(1).max(4_000),
  receipt: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const rollbackLightConfigurationSchema = z.object({
  revision: z.number().int().positive(),
  note: z.string().trim().max(2_000).optional().nullable(),
}).strict();

export const captureTaskCheckpointSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(4_096)).min(1).max(2_000),
  agentId: z.string().guid().optional(),
  runId: z.string().guid().optional().nullable(),
  summary: z.string().trim().max(2_000).optional().nullable(),
}).strict();

export const restoreTaskCheckpointSchema = z.object({
  runId: z.string().guid().optional().nullable(),
}).strict();

export type ExecutionProfile = z.infer<typeof executionProfileSchema>;
export type LightModelProfile = z.infer<typeof lightModelProfileSchema>;
export type LightContextComponentBudgets = z.infer<typeof lightContextComponentBudgetsSchema>;
export type LightCompanyConfig = z.infer<typeof lightCompanyConfigSchema>;
export type LightRepositoryPolicy = z.infer<typeof lightRepositoryPolicySchema>;
export type ReserveProjectFilesInput = z.infer<typeof reserveProjectFilesSchema>;
export type RenewProjectFilesInput = z.infer<typeof renewProjectFilesSchema>;
export type ReleaseProjectFilesInput = z.infer<typeof releaseProjectFilesSchema>;
export type RepositoryOperationInput = z.infer<typeof repositoryOperationSchema>;
export type TaskReviewRequestInput = z.infer<typeof taskReviewRequestSchema>;
export type TaskReviewDecisionInput = z.infer<typeof taskReviewDecisionSchema>;
export type ProjectMemoryCreateInput = z.infer<typeof projectMemoryCreateSchema>;
export type ProjectMemoryUpdateInput = z.infer<typeof projectMemoryUpdateSchema>;
export type CreateHumanActionInput = z.infer<typeof createHumanActionSchema>;
export type DecideHumanActionInput = z.infer<typeof decideHumanActionSchema>;
export type ClaimHumanActionInput = z.infer<typeof claimHumanActionSchema>;
export type CompleteHumanActionInput = z.infer<typeof completeHumanActionSchema>;
export type ReconcileHumanActionInput = z.infer<typeof reconcileHumanActionSchema>;
export type RollbackLightConfigurationInput = z.infer<typeof rollbackLightConfigurationSchema>;
export type CaptureTaskCheckpointInput = z.infer<typeof captureTaskCheckpointSchema>;
export type RestoreTaskCheckpointInput = z.infer<typeof restoreTaskCheckpointSchema>;
