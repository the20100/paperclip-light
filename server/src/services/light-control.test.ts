import { describe, expect, it } from "vitest";
import {
  estimateContextTokens,
  planRunContextComponents,
  projectMemoryScore,
  selectProjectMemoryItems,
} from "./light-control.js";

describe("Paperclip Light context controls", () => {
  it("estimates compact text without storing the content", () => {
    expect(estimateContextTokens("abcd")).toBe(1);
    expect(estimateContextTokens("éé")).toBe(1);
    expect(estimateContextTokens("compact task context")).toBeGreaterThan(0);
  });

  it("ranks important recent memory above old low-confidence memory", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    const recent = projectMemoryScore({
      importance: 70,
      confidence: 100,
      lastConfirmedAt: "2026-08-30T12:00:00.000Z",
    }, now);
    const stale = projectMemoryScore({
      importance: 70,
      confidence: 50,
      lastConfirmedAt: "2026-01-01T12:00:00.000Z",
    }, now);
    expect(recent).toBeGreaterThan(stale);
  });

  it("keeps required context, prioritizes optional context, and records budget exclusions", () => {
    const plan = planRunContextComponents([
      { componentKind: "task", content: "T".repeat(400), required: true, priority: 100 },
      { componentKind: "memory", content: "M".repeat(200), priority: 10 },
      { componentKind: "skills", content: "S".repeat(200), priority: 20 },
    ], [], { tokenBudget: 180, reservedOutputTokens: 20 });

    expect(plan[0]).toMatchObject({ included: true });
    expect(plan[1]).toMatchObject({ included: false, exclusionReason: "context_budget" });
    expect(plan[2]).toMatchObject({ included: true });
  });

  it("deduplicates resumed-session and same-run context without hiding required deltas", () => {
    const repeated = "already sent";
    const [fromSession, sameRun, delta] = planRunContextComponents([
      { componentKind: "task", content: repeated },
      { componentKind: "memory", content: repeated },
      { componentKind: "event_delta", content: "new user instruction", required: true },
    ], [{ id: "prior-1", contentHash: "b5e200507ac7593d9202eb9bc81031707b68af9a8efc14f68e922f10f5beb712" }], {
      resumedSession: true,
      tokenBudget: 1_000,
    });

    expect(fromSession.included).toBe(false);
    expect(fromSession.exclusionReason).toBe("duplicate_in_resumed_session");
    expect(sameRun.included).toBe(false);
    expect(sameRun.exclusionReason).toBe("duplicate_in_run");
    expect(delta.included).toBe(true);
  });

  it("selects relevant project memory within the explicit token budget", () => {
    const items = [
      { id: "a", category: "constraint", text: "SEO pages must use canonical URLs", importance: 70, confidence: 90, lastConfirmedAt: "2026-08-30" },
      { id: "b", category: "fact", text: "The backend uses PostgreSQL", importance: 70, confidence: 90, lastConfirmedAt: "2026-08-30" },
    ];
    const selected = selectProjectMemoryItems(items, {
      taskText: "Fix the SEO canonical URL on landing pages",
      tokenBudget: estimateContextTokens("- [constraint] SEO pages must use canonical URLs"),
      now: new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(selected.map((item) => item.id)).toEqual(["a"]);
  });
});
