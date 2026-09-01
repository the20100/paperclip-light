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

Finish once with `pc task submit TASK -s "Result; checks; artifact or URL; risk."`; managers decide with `pc review decide TASK REVIEW accepted|changes_requested -s "reason"`.

Before email, payment, publication, deploy, deletion, account creation, or secret change: `pc action request COMPANY KIND -s "exact action" -k "stable-key" --task TASK`, then stop until approved.

Make reasonable assumptions. Ask a human only for irreversible external effects, missing critical authority, or a genuine decision.
