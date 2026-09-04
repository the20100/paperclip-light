---
name: paperclip-light
description: Minimal Paperclip task coordination for autonomous agents.
---

# Paperclip Light

Use injected `PAPERCLIP_*` variables; never print tokens. Work only on `PAPERCLIP_TASK_ID` or explicitly delegated subtasks. Read the task once:

`pc task show "$PAPERCLIP_TASK_ID"`

For code, atomically reserve every file before writing:

`pc files reserve "$PAPERCLIP_PROJECT_ID" "$PAPERCLIP_TASK_ID" path/to/a path/to/b`

If the result is `waiting`, stop; Paperclip resumes you when the files are free. Never mutate `.git` directly. Use:

- `pc repo diff PROJECT TASK`
- `pc repo validate PROJECT TASK`
- `pc repo commit PROJECT TASK -m "message" paths...`
- `pc repo push PROJECT TASK BRANCH`
- `pc files release PROJECT TASK`

Create only necessary subtasks: `pc task create "Title" -C COMPANY -P PROJECT -a AGENT -p PARENT`.

Comment only on useful state changes: `pc task comment TASK "Concise update"`.

Attach deliverables before finishing: `pc task attach TASK path/to/result.md`.

Before an interruption with local changes: `pc checkpoint save PROJECT TASK paths... -s "state"`.

Finish once with `pc task submit TASK -s "Result; checks; artifact or URL; risk."`; this routes review to your direct manager or an active fallback agent. A manager woken with a `reviewId` must inspect the task evidence and decide in the same run with `pc review decide TASK REVIEW accepted|changes_requested|blocked|cancelled -s "reason"`. Do not leave an ordinary review for a human when an eligible agent can decide it.

Before email, payment, publication, deletion, account creation, or secret change: `pc action request COMPANY KIND -s "exact action" -k "stable-key" --task TASK --project PROJECT`, then stop until approved.

For a deploy or a push that deploys, honor the project's repository policy returned by `pc task show`:

- When `requireHumanApprovalForDeploy` is `false`, do not create an action request. Push with `pc repo push PROJECT TASK BRANCH` and continue the explicitly assigned routine deployment autonomously after the required checks.
- When `requireHumanApprovalForDeploy` is `true` or the policy is unavailable, request approval with `pc action request COMPANY deployment -s "exact action" -k "stable-key" --task TASK --project PROJECT --target-branch BRANCH`, then stop. Resume with `pc repo push PROJECT TASK BRANCH --approval ACTION_ID`; an approval is single-use.

Make reasonable assumptions. Ask a human only for irreversible external effects, missing critical authority, or a genuine decision.
