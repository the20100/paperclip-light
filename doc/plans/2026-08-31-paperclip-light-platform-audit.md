# Paperclip Light — platform implementation audit

Date: 2026-08-31

Scope: database, shared contracts, server, runtime adapters, CLI, bundled skill, task UI, Action Center, company/agent/project/secret settings, desktop and 390 × 844 responsive behavior, migrations, tests, and the local service.

Status legend:

- **Implemented** — the vertical slice is wired across storage, service, API, and its relevant operator or agent surface.
- **Partial** — the useful core exists, but a stronger production guarantee or broader diagnostic surface remains.
- **External validation** — code support exists, but a real provider, credential, or operating-system boundary is required to prove the final behavior.

## Executive result

Paperclip Light is now a coherent execution profile rather than a documentation-only target. It removes periodic model wakes from Light operation, prevents ordinary comments from launching runs, bounds sessions and context, records the reason and context composition of every task run, supports structured review and persistent project memory, provides a compact agent CLI, and consolidates human-only work in an Action Center.

The shared-checkout workflow is usable without worktrees: an agent reserves repository-relative paths, waits deterministically on conflicts, works in the shared checkout, validates, commits through an isolated index, pushes only to allowed branches, and releases its reservation. Checkpoints preserve a task-owned diff for pause and recovery.

The remaining gaps are deliberately narrow and are not solved honestly by more UI:

1. File reservations cannot prevent a malicious or non-cooperating shell process from writing directly to an unreserved file. The broker rejects unauthorized commits, but strict write prevention needs an OS sandbox or filesystem mediation.
2. Context sizes are attributed and estimated, not counted with each provider's exact tokenizer.
3. Automatic model routing now scores configured capability, health freshness, context/output capacity, price, quality, locality, and resumability; live provider health, quota, and price ingestion still needs provider-specific integrations.
4. OpenCode and open-source execution still needs end-to-end validation with the operator's actual runtimes, models, and credentials.

## Implementation matrix

| # | Capability | Status | Current implementation |
|---|---|---|---|
| 1 | Multiple companies, projects, and humans | **Implemented** | Existing isolation, membership, role, switching, project, and invitation surfaces remain intact. |
| 2 | Agents, instructions, org chart, and skills | **Implemented** | Company agents retain reporting lines, versioned configuration, instructions, attached skills, tools, runs, audit, and budgets. |
| 3 | Provider-neutral execution | **Implemented** | Light is applied above the adapter layer and works with Codex, Claude Code, OpenCode, Gemini CLI, Grok, Kimi, Pi, Cursor, Hermes, and custom processes. |
| 4 | Company Light profile | **Implemented** | Company Settings controls concurrency, retries, review cycles, context/memory/session budgets, task-tree limits, routine behavior, retention, health cadence, approvals, and hiring autonomy. |
| 5 | Per-agent Standard/Light override | **Implemented** | Agent Configuration always exposes inherit/force Standard/force Light; selecting Light immediately reveals model routing and capability controls. |
| 6 | No periodic model heartbeat | **Implemented** | Light agents are excluded from interval scheduling; task-less heartbeat actions and interval fields are hidden in Light UI. |
| 7 | Explicit event-only wakes | **Implemented** | Assignments, explicit resume, explicit mentions, review events, dependency changes, routines, retries, and released file reservations may run an agent. Ordinary comments remain durable without a model run. |
| 8 | Durable execution-event ledger | **Implemented** | `light_execution_events` mirrors every task-bound Light run with an idempotency key, run link, event kind, payload, and lifecycle status. Database triggers keep it synchronized with the proven run engine. |
| 9 | Task-isolated bounded sessions | **Implemented** | Task keys are isolated by default. Sessions reset on configured run count, accumulated input estimate, or age; isolation can be disabled explicitly. |
| 10 | Bounded context | **Implemented** | Task, event, project brief, memory, skills, protocol, and continuation components have independent ceilings under one total budget; required event/task content is preserved and optional components are selected by deterministic priority. |
| 11 | Context component ledger | **Implemented** | Every Light run records task brief, wake delta, project brief, project memory, skill manifest, agent instructions, and execution policy with hashes, truthful inclusion/exclusion state, same-run and resumed-session duplicate attribution, characters, and estimated tokens. |
| 12 | Exact provider tokenization | **Partial** | Actual usage still comes from provider reports, while pre-run component attribution uses a language-aware estimate rather than every provider tokenizer. |
| 13 | Selective skill loading | **Implemented** | Runtime skill manifests and explicit run-scoped skill mentions are preserved; the short Light skill avoids a large operational prompt. |
| 14 | Compact project memory | **Implemented** | Durable categorized items support source links, confidence, importance, confirmation, supersession, expiry, deduplication, token budget, logarithmic age decay, and lexical task relevance. |
| 15 | Minimal agent CLI | **Implemented** | `pc task`, `agent`, `skill`, `secret`, `review`, `checkpoint`, `memory`, `action`, `files`, `run`, and `repo` cover the normal workflow and resolve human task, agent, and project references. |
| 16 | Short operational skill | **Implemented** | `skills/paperclip-light/SKILL.md` documents the essential sequence without reloading the product specification. |
| 17 | Task statuses and interruption | **Implemented** | `paused`, `blocked`, `failed`, `cancelled`, review, and terminal states are wired across schema, server, boards, filters, badges, and runtime behavior. |
| 18 | Task dependencies and anti-explosion limits | **Implemented** | Existing first-class relations handle dependencies; Light enforces depth, direct-child, total-tree, duplicate-child, and cross-task-write limits. |
| 19 | Configurable concurrency and retries | **Implemented** | Company capacity is transactionally enforced. Technical retries are bounded and exhaustion moves the task to `failed` with a precise reason. |
| 20 | Structured manager review | **Implemented** | Dedicated review records, monotonic revisions, configured cycle limits, manager default routing, accepted/changes-requested decisions, and targeted wakes are implemented. |
| 21 | Routine tasks and overlap policy | **Implemented** | Routines create normal tasks and inherit Light defaults for overlap (`skip`, `coalesce`, or parallel) and missed-run behavior. |
| 22 | Shared repository policy | **Implemented** | Project Configuration covers project context documents, active branch, allowed push/merge branches, remote, validation pipeline, lease, file cap, ephemeral roots, enforcement, clean barrier, and commit/push/merge/deploy approval. |
| 23 | File reservations and waiting | **Implemented** | Atomic reserve/wait/renew/lifecycle-release, normalized canonical paths, directory overlap, deadlock rejection, orphan detection, force release, task pause, FIFO promotion, and resumption are present. |
| 24 | Brokered Git operations | **Implemented** | Status, diff, fetch, sync, validate, isolated-index commit, fast-forward merge, and branch-constrained push are serialized and audited. |
| 25 | Strict OS write confinement | **External validation** | Broker policy is strict at commit/push time. Preventing all direct shell writes requires sandboxed mounts, FUSE, containers, or runtime-level write interception. |
| 26 | Task checkpoints | **Implemented** | The CLI and API capture task-owned patches with base SHA and hash, restore only compatible work, and allow explicit discard. |
| 27 | Company/project/agent secrets | **Implemented** | Existing encrypted company secrets can be bound explicitly to agents or projects; project values override agent values and agents propose restricted grant changes through human approval. |
| 28 | Secret non-retransmission guarantee | **External validation** | Delivery and use are audited and values stay server-side until authorized injection. No control plane can revoke knowledge already disclosed to an unsandboxed process. |
| 29 | Human Action Center | **Implemented** | One Light queue consolidates governed external actions, legacy approvals, pending reviews, and failed tasks with concise English summaries and quick approve/reject/accept/retry/cancel paths. |
| 30 | Exactly-once external-effect contract | **Implemented** | Human actions use unique request/provider idempotency keys, scoped approval, idempotent claims/completions, safe/unknown failure states, immutable receipts, and explicit reconciliation. Provider connectors must forward the provider key. |
| 31 | Task/tree tokens and cost | **Implemented** | Task headers show direct usage or parent-tree rollups, input/cached/output detail, runtime, run count, billed cost, unpriced usage, or subscription inclusion. |
| 32 | Company/project/agent cost views | **Implemented** | Existing Costs and Budget views remain available with provider, biller, project, agent, finance, and ledger filters. |
| 33 | Cost/context diagnostics | **Implemented** | Run context attribution is visible in the Light operations block, while Costs reports accepted tasks, first-pass outcomes, review cycles, failures, fallbacks, human interventions, and token/cost per accepted task. |
| 34 | Detailed logs and retention | **Implemented** | Durable run/task/cost history stays; terminal local log blobs are deleted after the configured period, default 30 days. |
| 35 | Deterministic free maintenance | **Implemented** | The non-LLM sweep orphans expired reservations, fails stuck repository operations, expires approvals/memory, and prunes logs. |
| 36 | Provider health and quota registry | **Partial** | The company registry stores provider/model identity, capabilities, context/output limits, configured prices, quality, location, resume support, health/reason/timestamp, and deterministic staleness. Live provider/quota ingestion remains provider-specific external work. |
| 37 | Capability routing and fallback | **Implemented** | Per-agent fixed/auto policy filters models by capabilities, health, context, output, and price; fallback/pause behavior and every inspected rejection reason are persisted before adapter execution. |
| 38 | Cost/difficulty auto-routing | **Implemented** | Auto mode deterministically scores configured price, quality, health, locality, and resume support without spending model tokens. Live telemetry can improve the inputs without changing the routing contract. |
| 39 | Migration readiness preview | **Implemented** | Company Settings reports manager/reviewer fallback, oversized prompts, periodic heartbeats, inherited routing, missing broker/workspace/validation, advisory enforcement, and empty model registry without mutating authority or repository state. |
| 40 | End-to-end conformance | **Partial** | Unit and integration coverage spans validators, comments, ledgers, routing, retries, costs, CLI, shared repository, task detail, and adapter context. Real OpenCode/open-source provider smoke tests require configured binaries and credentials. |

## Interface verification

### Company Settings

- Standard and Light profiles are always selectable.
- Selecting Light reveals every company policy without saving prematurely.
- An unsaved Light profile explains that readiness becomes available after saving instead of rendering an empty panel.
- The wording names only explicit wake events; it no longer implies that ordinary comments run agents.
- The two-column desktop layout stacks cleanly at 390 px. Inputs, selects, toggles, help text, save state, errors, and the bottom navigation remain usable.
- Legacy Light companies with partially populated configuration are normalized through the current schema defaults, so adding a new setting cannot crash the page.
- Model registry, per-component budgets, quality window, provider-health TTL, readiness findings, and restorable configuration history are exposed on the dedicated Light route.

### Agent Settings

- Execution mode is visible even when the company remains Standard.
- Force Light activates routing controls immediately in the form.
- Primary model, ordered fallbacks, unavailable behavior, fallback enablement, and capability tags are editable without exposing interval heartbeat controls.

### Project Settings

- Light projects expose the repository broker only when relevant.
- Branch and validation policy, reservation state, repository operations, and deploy approval are grouped under project configuration.
- The existing primary workspace remains the source of truth; enabling Light does not silently create branches or worktrees.
- Repository-owned context files, merge sources, validation pipelines, commit/push/merge gates, ephemeral roots, and reservation state are editable without leaving Project Configuration.

### Secrets Settings

- Company secret creation and encrypted storage remain separate from access bindings.
- Agent and project bindings are explicit; the UI explains override precedence.
- No secret value is displayed in run logs or the Light context ledger.

### Tasks and costs

- The compact usage strip is visible in the task header and distinguishes billed, subscription-included, and unavailable cost.
- Parent tasks show both direct task usage and the complete subtree total.
- The collapsible Light operations block exposes event, review, reservation, checkpoint, and context summaries without cluttering ordinary task reading.
- Task detail remains usable on mobile; long content wraps and the composer/bottom navigation stay reachable.

### Action Center

- Empty state says that agents can continue autonomously.
- Human actions expose Approve/Reject; reviews expose Accept and task inspection; failed tasks expose Retry/Cancel and task inspection.
- Every card retains the source task, risk, state, and concise unblock summary.

## Verification evidence

- Focused Light tests cover component budgeting/deduplication, relevant memory selection, provider-neutral routing, unavailable-model pause, file-path normalization, deadlock detection, CLI credential hygiene and semantic operations, task costs, comments, and adapter context behavior.
- The focused selection passes **220 tests in 11 files**.
- Direct TypeScript checks for shared contracts, server, and UI pass; the full workspace build also compiles CLI, DB, adapters, plugins, and auxiliary packages.
- The full monorepo build passes, including the UI bundle, CLI, server, adapters, migration checks, and native runner.
- Token-design gates pass: 826 files scanned and all four gates are clean.
- `git diff --check` passes.
- Local `/api/health` reports `status: ok` and `bootstrapStatus: ready` on `http://127.0.0.1:3100`.
- Migrations `0234`–`0236` establish the Light execution tables and ledgers; additive migration `0237` creates immutable Light configuration revisions without rewriting prior migrations.

The isolated local database at `tmp/cosmo-paperclip` contains the `COM` company in Light mode. Browser QA covered Company Light settings, Agent Configuration, Secrets, Routines, Costs, task-level cost, Project Configuration, and Action Center without changing saved form values.

The repository-wide test runner was also sampled on the host's default Node 22 runtime, but was stopped after several hours because historical workspace, plugin, port-binding, and temporary-database suites failed, skipped after multi-minute waits, and eventually lost the temporary database connection. Paperclip declares Node 24.11 or newer. This infrastructure-heavy run is therefore not claimed as green; the bounded Light selection, deterministic typechecks, complete build, migration safety checks, token gates, health endpoint, and browser QA are the release evidence for this implementation pass.
