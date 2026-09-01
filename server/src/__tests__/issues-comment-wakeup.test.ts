import { describe, expect, it } from "vitest";
import { shouldWakeAssigneeForIssueComment } from "../routes/issues-comment-wakeup.js";

describe("Light issue comment wake policy", () => {
  it("keeps ordinary comments non-executing in Light mode", () => {
    expect(shouldWakeAssigneeForIssueComment({
      lightExecutionEnabled: true,
      reopened: false,
      resumeRequested: false,
      skipWake: false,
    })).toBe(false);
  });

  it("allows an explicit Light resume", () => {
    expect(shouldWakeAssigneeForIssueComment({
      lightExecutionEnabled: true,
      reopened: true,
      resumeRequested: true,
      skipWake: false,
    })).toBe(true);
  });

  it("does not turn an assignee self-comment into a resume", () => {
    expect(shouldWakeAssigneeForIssueComment({
      lightExecutionEnabled: true,
      reopened: true,
      resumeRequested: true,
      skipWake: true,
    })).toBe(false);
  });

  it("preserves the standard profile comment behavior", () => {
    expect(shouldWakeAssigneeForIssueComment({
      lightExecutionEnabled: false,
      reopened: false,
      resumeRequested: false,
      skipWake: false,
    })).toBe(true);
    expect(shouldWakeAssigneeForIssueComment({
      lightExecutionEnabled: false,
      reopened: true,
      resumeRequested: false,
      skipWake: true,
    })).toBe(true);
  });
});
