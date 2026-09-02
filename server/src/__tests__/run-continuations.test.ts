import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_LIVENESS_CONTINUATION_ATTEMPTS,
  RUN_LIVENESS_CONTINUATION_REASON,
  buildRunLivenessContinuationIdempotencyKey,
  decideRunLivenessContinuation,
} from "../services/run-continuations.ts";

const companyId = "company-1";
const agentId = "agent-1";
const issueId = "issue-1";
const runId = "run-1";

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    companyId,
    agentId,
    continuationAttempt: 0,
    ...overrides,
  } as never;
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: issueId,
    companyId,
    identifier: "PAP-1577",
    title: "Add bounded liveness continuation wakes",
    status: "in_progress",
    assigneeAgentId: agentId,
    executionState: null,
    projectId: null,
    ...overrides,
  } as never;
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    id: agentId,
    companyId,
    status: "idle",
    ...overrides,
  } as never;
}

describe("run liveness continuations", () => {
  it("does not continue narrated future work for the same agent", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue(),
      agent: agent(),
      livenessState: "needs_followup",
      livenessReason: "Planned without acting",
      nextAction: "Take the first concrete action now.",
      budgetBlocked: false,
      idempotentWakeExists: false,
    });

    expect(decision).toEqual({
      kind: "skip",
      reason: "liveness state is not actionable for continuation",
    });
  });

  it("enqueues the second empty_response continuation", () => {
    const decision = decideRunLivenessContinuation({
      run: run({ continuationAttempt: 1 }),
      issue: issue(),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "No useful output",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
    });

    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.nextAttempt).toBe(2);
  });

  it("leaves advanced terminal runs to stranded issue recovery instead of bounded liveness continuation", () => {
    const decision = decideRunLivenessContinuation({
      run: run(),
      issue: issue(),
      agent: agent(),
      livenessState: "advanced",
      livenessReason: "Run produced concrete action evidence: created an issue comment",
      nextAction: "Resume the implementation from the remaining acceptance criteria.",
      budgetBlocked: false,
      idempotentWakeExists: false,
    });

    expect(decision).toEqual({
      kind: "skip",
      reason: "liveness state is not actionable for continuation",
    });
  });

  it("does not enqueue a third continuation and returns an exhaustion comment", () => {
    const decision = decideRunLivenessContinuation({
      run: run({ continuationAttempt: 2 }),
      issue: issue(),
      agent: agent(),
      livenessState: "empty_response",
      livenessReason: "Still planning",
      nextAction: null,
      budgetBlocked: false,
      idempotentWakeExists: false,
    });

    expect(decision.kind).toBe("exhausted");
    if (decision.kind !== "exhausted") return;
    expect(decision.comment).toContain("Bounded liveness continuation exhausted");
    expect(decision.comment).toContain("Attempts used: 2/2");
  });

  it("skips non-actionable and guarded issues", () => {
    const guardedCases = [
      { livenessState: "advanced" as const },
      { issue: issue({ status: "done" }) },
      { issue: issue({ assigneeAgentId: "other-agent" }) },
      { issue: issue({ executionState: { status: "pending" } }) },
      { agent: agent({ status: "paused" }) },
      { budgetBlocked: true },
      { idempotentWakeExists: true },
    ];

    for (const guarded of guardedCases) {
      const decision = decideRunLivenessContinuation({
        run: run(),
        issue: guarded.issue ?? issue(),
        agent: guarded.agent ?? agent(),
        livenessState: guarded.livenessState ?? "empty_response",
        livenessReason: "No progress",
        nextAction: null,
        budgetBlocked: guarded.budgetBlocked ?? false,
        idempotentWakeExists: guarded.idempotentWakeExists ?? false,
      });

      expect(decision.kind).toBe("skip");
    }
  });
});
