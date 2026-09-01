import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  lightCompanyConfigSchema,
  lightRepositoryPolicySchema,
  repositoryOperationSchema,
} from "./light-execution.js";

describe("Paperclip Light contracts", () => {
  it("applies finite token, retry, concurrency, and task-tree defaults", () => {
    expect(lightCompanyConfigSchema.parse({})).toMatchObject({
      maxConcurrentRuns: 4,
      technicalRetryLimit: 2,
      maxTaskDepth: 3,
      maxChildrenPerTask: 12,
      maxTasksPerTree: 50,
      maxReviewCycles: 3,
      maxCrossAgentMentionsPerTree: 5,
      taskSessionIsolation: true,
      maxSessionRuns: 6,
      routineConcurrencyPolicy: "skip_if_active",
      routineCatchUpPolicy: "skip_missed",
      contextTokenBudget: 16_000,
      logRetentionDays: 30,
      providerHealthTtlSeconds: 300,
      qualityAnalyticsWindowDays: 30,
      contextComponentBudgets: expect.objectContaining({
        task: 4_000,
        reservedOutput: 2_000,
      }),
    });
  });

  it("keeps the Light routine defaults on native Paperclip policies", () => {
    expect(lightCompanyConfigSchema.parse({
      routineConcurrencyPolicy: "coalesce_if_active",
      routineCatchUpPolicy: "enqueue_missed_with_cap",
    })).toMatchObject({
      routineConcurrencyPolicy: "coalesce_if_active",
      routineCatchUpPolicy: "enqueue_missed_with_cap",
    });
  });

  it("requires the active branch to be pushable", () => {
    expect(() => lightRepositoryPolicySchema.parse({
      activeBranch: "development",
      allowedPushBranches: ["main"],
    })).toThrow(/must include activeBranch/);
  });

  it("allows merge sources to differ from the active working branch", () => {
    expect(lightRepositoryPolicySchema.parse({
      activeBranch: "development",
      allowedPushBranches: ["development"],
      allowedMergeTargets: ["main"],
    }).allowedMergeTargets).toEqual(["main"]);
  });

  it("requires the inputs that can make a Git operation irreversible", () => {
    expect(() => repositoryOperationSchema.parse({ issueId: randomUUID(), kind: "commit" }))
      .toThrow(/Commit message/);
    expect(() => repositoryOperationSchema.parse({ issueId: randomUUID(), kind: "push" }))
      .toThrow(/Target branch/);
  });

  it("accepts a single-use human action reference for an approved push", () => {
    const humanActionId = randomUUID();
    expect(repositoryOperationSchema.parse({
      issueId: randomUUID(),
      kind: "push",
      targetBranch: "main",
      humanActionId,
    }).humanActionId).toBe(humanActionId);
  });
});
