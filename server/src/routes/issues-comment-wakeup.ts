export interface IssueCommentAssigneeWakeInput {
  lightExecutionEnabled: boolean;
  reopened: boolean;
  resumeRequested: boolean;
  skipWake: boolean;
}

/**
 * Standard Paperclip preserves its historical comment-driven continuation.
 * Light Paperclip only runs the assignee when the caller explicitly asks to
 * resume work. Mentions, review transitions, dependency resolution, and child
 * completion are separate typed wake paths and do not pass through this gate.
 */
export function shouldWakeAssigneeForIssueComment(input: IssueCommentAssigneeWakeInput): boolean {
  if (input.lightExecutionEnabled) {
    return input.resumeRequested && !input.skipWake;
  }
  return input.reopened || !input.skipWake;
}
