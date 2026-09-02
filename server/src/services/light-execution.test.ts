import { describe, expect, it } from "vitest";
import {
  isExpiredReservationReclaimable,
  normalizeReservedPath,
  reservationWaitCycle,
  reservedPathsOverlap,
} from "./light-execution.js";

describe("Paperclip Light file reservations", () => {
  it("normalizes repository-relative paths deterministically", () => {
    expect(normalizeReservedPath("./src\\features/../features/task.ts")).toBe("src/features/task.ts");
  });

  it("rejects absolute paths, escapes, and Git internals", () => {
    expect(() => normalizeReservedPath("/tmp/file.ts")).toThrow(/repository-relative/);
    expect(() => normalizeReservedPath("../outside.ts")).toThrow(/escapes/);
    expect(() => normalizeReservedPath(".git/index")).toThrow(/\.git directory/);
  });

  it("treats directories and their descendants as conflicting", () => {
    expect(reservedPathsOverlap("src", "src/app.ts")).toBe(true);
    expect(reservedPathsOverlap("src/app.ts", "src/app.ts")).toBe(true);
    expect(reservedPathsOverlap("src/app.ts", "src/app.test.ts")).toBe(false);
    expect(reservedPathsOverlap("src", "scripts/build.ts")).toBe(false);
  });

  it("detects a reservation wait cycle before another task is queued", () => {
    expect(reservationWaitCycle({
      requesterIssueId: "task-a",
      blockerIssueIds: ["task-b"],
      reservations: [
        { id: "lock-a", issueId: "task-a", status: "active", blockedByReservationId: null },
        { id: "wait-b", issueId: "task-b", status: "waiting", blockedByReservationId: "lock-a" },
      ],
    })).toEqual(["task-a", "task-b", "task-a"]);
  });

  it("allows an acyclic waiter chain", () => {
    expect(reservationWaitCycle({
      requesterIssueId: "task-c",
      blockerIssueIds: ["task-b"],
      reservations: [
        { id: "lock-a", issueId: "task-a", status: "active", blockedByReservationId: null },
        { id: "wait-b", issueId: "task-b", status: "waiting", blockedByReservationId: "lock-a" },
      ],
    })).toBeNull();
  });

  it("reclaims expired reservations once their owner has no live execution path", () => {
    expect(isExpiredReservationReclaimable({
      issueStatus: "in_progress",
      runId: "run-1",
      runStatus: "running",
    })).toBe(false);
    expect(isExpiredReservationReclaimable({
      issueStatus: "in_progress",
      runId: "run-1",
      runStatus: "succeeded",
    })).toBe(true);
    expect(isExpiredReservationReclaimable({
      issueStatus: "in_review",
      runId: "run-1",
      runStatus: "running",
    })).toBe(true);
    expect(isExpiredReservationReclaimable({
      issueStatus: "in_progress",
      runId: null,
      runStatus: null,
    })).toBe(false);
    expect(isExpiredReservationReclaimable({
      issueStatus: "in_progress",
      runId: "run-1",
      runStatus: "failed",
    })).toBe(false);
  });
});
