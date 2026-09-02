---
title: Paperclip Light
summary: Product and technical specification for a token-efficient, autonomous, provider-neutral agent control plane
---

> **Status: living product and technical specification.** The first Paperclip Light vertical slice is implemented behind the company execution-profile setting. Normative `MUST` requirements describe the completed product target; features beyond the implementation baseline below remain rollout requirements rather than claims about current behavior.

# Paperclip Light

Paperclip Light is a simplified execution profile for autonomous AI companies. It preserves the parts of Paperclip that create the most value—companies, projects, agents, org charts, skills, tasks, reviews, routines, secrets, logs, and cost control—while removing periodic model heartbeats, implicit context reconstruction, and recursive recovery behavior from the normal execution path.

The intended result is a control plane that can coordinate software-development and marketing teams made of heterogeneous agents, including OpenCode, Codex, Claude Code, Gemini CLI, Grok, open-source models, direct APIs, and custom processes, without depending on provider-specific prompt or session behavior.

Paperclip Light is designed around one central rule:

> A model run is created only when a durable event requires an agent to perform useful work.

### Implementation baseline — 2026-08-31

The repository currently includes the following Light-mode foundation:

- Company-level Light profile and token, concurrency, retry, task-tree, log-retention, health, and approval settings.
- Per-component context ceilings, required-component preservation, priority-based optional selection, exact-hash deduplication within a run and across resumed sessions, and truthful inclusion/exclusion diagnostics.
- Per-agent fixed or automatic model routing with primary/fallback behavior, capability requirements, unavailable behavior, context/output limits, local/remote preference, price caps, quality scores, health state, and an inspectable decision record.
- Project-level shared-repository policy with active branch, allowed push and merge branches, remote, validation pipeline, lease, ephemeral roots, and commit/push/merge/deploy approval settings.
- Atomic file reservation, waiting, renewal, lifecycle release, orphan detection, human force release, FIFO waiter promotion, deadlock detection, and canonical-path protection against traversal, symlink escape, and case aliases.
- Serialized repository status, diff, fetch, sync, validation, isolated-index commit, fast-forward merge, and policy-constrained push operations.
- Capture, restore, list, and discard workflows for task-owned repository checkpoints.
- Compact Light prompts, task-relevant durable project memory with importance/confidence/age/relevance ranking, bounded repository-owned project brief documents, and a short `paperclip-light` skill.
- A hashed per-run context-component ledger with inclusion, estimated-token, and duplicate attribution.
- `pc task`, `pc agent`, `pc skill`, `pc secret`, `pc review`, `pc checkpoint`, `pc memory`, `pc action`, `pc files`, `pc run`, and `pc repo` commands with semantic task, agent, and project identifiers.
- Company-wide concurrency enforcement, bounded technical retries, and terminal task failure after retry exhaustion.
- Explicit-only comment execution: ordinary comments remain durable collaboration records, while Light runs require an explicit resume, mention, review, dependency, routine, or assignment event.
- Light-aware agent controls that remove task-less heartbeat actions and interval scheduling from the agent UI.
- A durable execution-event ledger synchronized transactionally from task-bound Light runs.
- Structured manager review records with bounded revision cycles and targeted reviewer/author wakeups.
- Routine overlap and missed-occurrence defaults configurable at company level and applied to new routines.
- An Action Center combining governed external effects, approvals, reviews, and failed tasks.
- Exactly-once external-effect preparation through unique request/provider keys, scoped human decisions, idempotent exclusive execution claims/completion, safe-versus-unknown failure states, immutable receipts, and explicit human reconciliation.
- Deterministic maintenance that does not wake models, including reservation orphaning, stale repository-operation failure, action/memory expiry, provider-health evidence expiry, and configurable run-log deletion.
- Light task-tree depth, direct-child, and total-tree limits.
- `paused` and `failed` task states across the server and board, plus orphaned file-lock items in the Action Center.
- Direct and full-task-tree usage shown in the task header with billed, subscription-included, and unavailable-cost states.
- Cost-per-accepted-task, first-pass review, review-cycle, failure, fallback, human-intervention, and token-efficiency analytics on the Costs page.
- Versioned and restorable company Light configuration, plus Light profile/config preservation in full company export and import.
- A migration-readiness preview covering manager/reviewer fallback, oversized prompts, forbidden periodic heartbeats, inherited routing, repository/workspace readiness, validation policy, and empty model registries.
- Dedicated Company Light settings and responsive project, agent, secret, Action Center, Costs, and task diagnostics verified at 390 px and 1440 px.
- Board-only Files and Terminal work surfaces at company and project scope. Company tools start in the company instance folder; project tools resolve the primary local project workspace. The file explorer supports bounded search, preview, text editing, upload, rename, download, and guarded deletion. Terminal access uses a real host PTY behind a short-lived, one-time WebSocket credential and filters secret-like variables from the server process environment before spawning the shell.

Existing Paperclip services continue to provide companies, projects, agents, org charts, adapters, skills, routines, encrypted secrets and scoped bindings, artifacts, multi-user access, approvals, activity logs, and cost events. Remaining external hardening is limited to OS-level write confinement, exact provider tokenizers for pre-run attribution, live provider health/price telemetry, and real-provider conformance runs with operator credentials. These are stated as external validation boundaries, not silently represented as completed guarantees.

## 1. Executive Summary

Paperclip Light MUST provide:

- Multiple isolated companies in one Paperclip instance.
- Multiple projects per company.
- Company-level agents organized in a strict reporting hierarchy.
- One shared repository checkout per source-controlled project, protected by exclusive file reservations and brokered Git operations.
- Reusable software-development, marketing, research, and administrative team templates.
- Provider-neutral execution through OpenCode, Codex, Claude Code, Gemini CLI, Grok, direct APIs, and custom adapters.
- A primary model and an optional ordered fallback policy per agent.
- Explicit model-capability metadata such as vision, tool use, context size, structured output, and session resume.
- Tasks and subtasks with one assignee, one project, attachments, concise completion summaries, and hierarchical cost rollups.
- Autonomous delegation within the org chart.
- Agent-to-agent review before completion where project or agent policy requires it.
- Human approval only for governed, sensitive, or irreversible actions.
- Company and project secrets with explicit per-agent grants.
- Routines that create normal tasks instead of invoking a parallel execution system.
- Configurable concurrency and retry limits.
- A compact, server-owned project memory.
- Per-run, per-task, per-task-tree, per-project, per-agent, and per-company token and cost reporting.
- Complete run logs without exposing secret values.
- Multiple human accounts with scoped operator, approver, auditor, and viewer roles.
- Thirty-day detailed log retention with durable tasks, summaries, outputs, costs, and version history retained until explicit cleanup.
- An agent-facing CLI small enough to explain in a short skill.
- Human operator Files and Terminal surfaces rooted deterministically at the active company or project workspace.

Paperclip Light MUST NOT require:

- Periodic LLM heartbeats.
- Full issue history in every prompt.
- A large operational Paperclip skill.
- Provider-native context management for correctness.
- Comments that implicitly wake agents.
- Recursive LLM-driven recovery.
- A human decision for ordinary reversible work.

## 2. Product Context

### 2.1 Primary use cases

The two primary use cases are:

1. **Software development**
   - Implementing and reviewing features.
   - Fixing bugs.
   - Creating applications from an initial brief.
   - Running tests, linting, type checks, builds, and QA.
   - Preparing commits, branches, pull requests, previews, and deployments.
   - Researching technical approaches and dependencies.

2. **Marketing operations**
   - SEO research and content production.
   - Advertising research and creative generation.
   - Campaign planning and execution.
   - Competitive and market research.
   - Analytics, reporting, and optimization.
   - Coordinating specialized research, copywriting, creative, and review agents.

Secondary use cases include research, administrative operations, support, web navigation, and other repeatable knowledge-work workflows.

### 2.2 Expected scale

A company may contain:

- Four or five agents for a small software-development team.
- Several dozen specialized agents for a marketing organization.
- Multiple projects sharing the same company-level agents, policies, and templates.

The architecture SHOULD support hundreds of registered agents across an instance, but active concurrency MUST remain operator-configurable according to available CPU, memory, GPU, network, and provider limits.

### 2.3 Expected task duration

Most tasks are expected to last from a few minutes to several hours. Multi-day tasks are possible but exceptional, such as building a large software product from scratch.

This duration profile favors:

- One isolated session per task.
- Continuous local tool use inside a run.
- Few Paperclip-level turns.
- Compact, explicit continuation when a review or external response is required.

## 3. Problem Statement

The full Paperclip execution engine optimizes for a broad liveness and governance model. It may include long operational instructions, large wake payloads, reused sessions, monitors, recovery actions, continuation inference, watchdogs, and periodic reconciliation.

For the target workflows, token consumption is amplified by two independent factors:

```text
total token cost
= number of model runs
  × context charged per model run
```

The context side grows through agent instructions, operational skills, task descriptions, comments, ancestors, recovery metadata, skill manifests, and accumulated session history.

The run-count side grows through periodic heartbeats, comment wakes, continuation inference, retries, status repair, recovery, and monitoring paths.

Paperclip Light reduces both factors:

- Make the context bounded, explicit, deduplicated, and measured.
- Create runs only from durable, allowlisted events.
- Enforce governance in code instead of repeatedly explaining it in prompts.
- Stop automatically after a bounded retry policy.

## 4. Goals and Non-Goals

### 4.1 Goals

1. Make simple tasks complete in one model run whenever possible.
2. Keep Paperclip-specific prompt overhead below a strict budget.
3. Support local, hosted, proprietary, and open-source models equally.
4. Let agents delegate and review work without routine human intervention.
5. Preserve complete operator visibility into tasks, runs, costs, logs, permissions, and secrets usage.
6. Make execution deterministic enough that the reason for every run is inspectable.
7. Keep the agent-facing Paperclip interface small and stable.
8. Preserve company isolation and explicit secret authorization.
9. Allow powerful advanced features to coexist outside the Light execution path.
10. Provide a gradual migration path for existing Paperclip companies.

### 4.2 Non-goals

Paperclip Light is not intended to:

- Remove projects, org charts, reviews, routines, or cost controls.
- Replace GitHub, a code review platform, an advertising platform, or a full CRM.
- Provide unrestricted self-modification of an organization by default.
- Guarantee secrecy after a credential has been delivered to an authorized process.
- Infer arbitrary workflows from comments or model prose.
- Automatically recover indefinitely from ambiguous state.
- Preserve unlimited conversation history in model context.
- Require every supported runtime to implement session resume.
- Make priorities and deadlines mandatory task fields.

## 5. Design Principles

### 5.1 Event-driven, not heartbeat-driven

Idle state MUST consume zero model tokens. Timers may inspect database state, create routine occurrences, enforce budgets, or perform maintenance, but MUST NOT invoke a model unless an explicit task event requires work.

### 5.2 Server-enforced governance

Permissions, state transitions, secret grants, concurrency, retry limits, budget limits, idempotency, and approval requirements MUST be enforced by deterministic server code. They SHOULD NOT be repeated in full in every agent prompt.

### 5.3 Autonomous by default

Agents SHOULD make reasonable reversible assumptions, use tools, test their work, delegate research, and ask another agent for review before involving a human.

### 5.4 Human attention is exceptional

The board SHOULD see only actions that need a human decision, such as payments, irreversible deletion, external communication, sensitive publication, account creation, permission elevation, or secret administration.

### 5.5 Explicit context

Every prompt component MUST have a named source, a size measurement, and a reason for inclusion. Context MUST NOT be reconstructed by dumping complete issue histories.

### 5.6 Provider neutrality

Correctness MUST NOT depend on Claude, Codex, OpenCode, or any other provider automatically compacting a session. Paperclip owns context budgets and continuation behavior.

### 5.7 Inspectable autonomy

Autonomy is allowed only when actions, permissions, costs, outputs, and decisions remain attributable to a company, project, task, agent, and run.

## 6. Core Product Model

```text
Paperclip instance
├── Company
│   ├── Company policy
│   ├── Team templates
│   ├── Agents and org chart
│   ├── Company skills
│   ├── Company secrets
│   ├── Projects
│   │   ├── Project brief
│   │   ├── Project memory
│   │   ├── Project secrets
│   │   ├── Project workspaces
│   │   ├── Routines
│   │   └── Tasks
│   │       ├── Subtasks
│   │       ├── Comments
│   │       ├── Attachments and outputs
│   │       ├── Reviews
│   │       └── Runs
│   ├── Human actions
│   ├── Activity and secret audit logs
│   └── Costs and budgets
```

### 6.1 Company

A company is the hard boundary for:

- Organization and reporting hierarchy.
- Authentication and authorization.
- Skills and team templates.
- Company-level secrets.
- Audit history.
- Cost and budget rollups.
- Data portability.

No agent, task, project, secret, run, or cost record may cross a company boundary.

### 6.2 Project

A project is the operational context for a product, repository, campaign, or mission. Examples:

- A SaaS product and its repositories.
- A marketing campaign.
- A client engagement.
- An SEO content program.

A project owns:

- A concise project brief.
- A compact memory.
- One primary Git repository and one Paperclip-managed shared checkout when the project contains source-controlled work.
- Repository policy, including the active working branch, allowed push destinations, merge permissions, validation commands, and deployment rules.
- Project secret bindings.
- Project routines.
- Tasks and task trees.
- Project-specific budgets and concurrency overrides.

Agents SHOULD remain company-level objects so the same engineering, marketing, or research agent can work across multiple projects.

### 6.3 Team templates

Team templates provide reusable starting structures without creating a separate company type. Initial bundled templates SHOULD include:

- `Software Team`
- `Marketing Team`
- `Research Team`
- `Solo Founder Team`

A template MAY define:

- Agent roles and reporting lines.
- Default instruction fragments.
- Default skills.
- Model capability requirements.
- Review policies.
- Optional routines.
- Secret declarations without values.
- Concurrency defaults.

Installing a template MUST create editable company-owned configuration. It MUST NOT introduce hidden runtime behavior.

## 7. Agent Model

### 7.1 Agent identity

An agent contains:

- Name.
- Role and optional title.
- Manager (`reportsToAgentId`).
- Capability tags.
- Permanent role instructions.
- Runtime adapter.
- Primary model.
- Fallback policy.
- Context limits.
- Skills assigned to the agent.
- Secret grants.
- Review policy.
- Concurrency limit.
- Retry limit.
- Budget policy.
- Governance permissions.

### 7.2 Org chart

The company org chart is a strict tree:

- Every non-root agent has exactly one manager.
- Cycles are forbidden.
- Managers may delegate work inside their managed subtree.
- Managers may review work produced by their direct or indirect reports when policy permits.
- Peer collaboration occurs through explicit mentions or assigned subtasks, not implicit shared ownership.

### 7.3 Delegation permissions

By default, an agent MAY:

- Create a subtask under its current task.
- Assign that subtask to an agent in its managed subtree.
- Comment on company-visible work.
- Mention another agent to request input.
- Update and complete its own task.
- Request review from its configured reviewer.
- Review work when it is an authorized reviewer.

By default, an agent MUST NOT:

- Create or delete companies.
- Grant itself new permissions.
- Attach a new secret to itself or another agent.
- Change the org chart.
- Hire or terminate agents without the configured governance flow.
- Exceed project, company, or host concurrency and budget limits.

Agent creation, org-chart changes, skill administration, and secret grants SHOULD require human approval by default. A company setting MAY allow specifically authorized manager agents to perform some or all of these actions without approval.

### 7.4 Agent capability tags

Capabilities MUST be machine-readable. Suggested built-in tags include:

- `vision`
- `image_generation`
- `tool_use`
- `structured_output`
- `reasoning`
- `web_navigation`
- `filesystem`
- `shell`
- `git`
- `long_context`
- `session_resume`
- `local_execution`
- `remote_execution`

Companies MAY add domain tags such as `typescript`, `seo`, `paid_ads`, `copywriting`, or `analytics`.

Capability tags inform assignment and routing but MUST NOT grant a permission by themselves.

## 8. Agent Instructions

### 8.1 Instruction layers

Agent context is composed from four separate layers:

1. **Role instructions** — stable identity, scope, quality bar, and manager.
2. **Project brief** — compact project-specific facts and constraints.
3. **Selected skills** — only skills explicitly assigned and relevant to the task.
4. **Task context** — the current task and event delta.

Operational Paperclip protocol MUST be supplied through structured tools or a short CLI skill, not copied into every role instruction.

### 8.2 Required role-instruction content

Role instructions SHOULD contain only:

- What the agent owns.
- What is outside its scope.
- Who it reports to.
- What it may delegate.
- What quality checks it must run.
- What output is required.
- Which actions require approval.
- When it must escalate.

They SHOULD NOT contain:

- API endpoint documentation.
- Heartbeat procedures.
- Lease and checkout mechanics.
- Recovery state machines.
- Complete CLI manuals.
- Lists of all company skills.
- Repeated generic safety boilerplate already enforced by the server.

### 8.3 Default autonomous decision policy

The default policy SHOULD be expressible in fewer than 150 words:

```text
Act immediately on assigned work. Make reversible, low-risk assumptions when
details are missing. Research or delegate before asking a human. Use only the
tools, skills, projects, and secrets granted to you. Test and correct your own
work before requesting review. Create subtasks when specialized or parallel
work is useful. Escalate to your manager when scope, authority, or quality is
unclear. Request human action only for an irreversible, sensitive, external,
or explicitly governed decision. End by recording one concise result and one
valid task disposition.
```

## 9. Provider-Neutral Runtime Architecture

### 9.1 Canonical runtime contract

Paperclip Light defines one adapter-neutral contract:

```ts
interface LightAgentAdapter {
  diagnose(config: AdapterConfig): Promise<DiagnosticResult>;
  start(input: StartRunInput): Promise<RunningProcess>;
  stream(run: RunningProcess): AsyncIterable<RunEvent>;
  cancel(run: RunningProcess, reason: string): Promise<void>;
  collectUsage(run: RunningProcess): Promise<UsageReport>;
  closeSession?(session: ProviderSession): Promise<void>;
}
```

The contract MUST support adapters for:

- OpenCode.
- Codex CLI.
- Claude Code.
- Gemini CLI.
- Grok-compatible runtimes.
- Direct OpenAI-compatible APIs.
- Direct provider APIs.
- Custom local processes.
- Custom HTTP or remote runners.

### 9.2 Adapter responsibilities

An adapter is responsible for:

- Validating runtime availability and authentication.
- Starting the provider process or request.
- Passing the bounded context.
- Exposing Paperclip actions through structured tools or the compact CLI.
- Streaming stdout, stderr, structured events, and tool calls.
- Reporting provider session identifiers.
- Reporting raw token usage and cost data.
- Supporting cancellation.
- Returning a normalized outcome.

An adapter MUST NOT decide task status, permissions, approvals, or retry policy.

### 9.3 Provider session behavior

Session resume is an optimization, not a correctness primitive.

- Each task starts in a fresh provider session by default.
- A task MAY resume its own session after a review, mention, or human action.
- A provider session MUST NOT be reused across unrelated tasks.
- Paperclip MUST rotate or summarize sessions according to its own limits.
- A runtime without session resume receives the same compact continuation in a new session.

## 10. Model Registry and Routing

### 10.1 Model profile

Each model profile SHOULD record:

```ts
interface ModelProfile {
  provider: string;
  modelId: string;
  displayName: string;
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
  capabilities: string[];
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsVision: boolean;
  supportsSessionResume: boolean;
  executionLocation: "local" | "remote";
  inputPricePerMillion: number | null;
  cachedInputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  enabled: boolean;
}
```

Local and open-source models MAY have no monetary price. Their usage MUST still record tokens, duration, and optional compute metrics.

### 10.2 Agent routing policy

Every agent defines:

- One primary model or an `auto` selector.
- Zero or more ordered fallback models.
- Whether fallback is enabled.
- Required capabilities.
- Maximum input context.
- Maximum output context.
- Optional maximum cost per run.

### 10.3 Fallback behavior

The default fallback policy is enabled and attempts an equivalent model.

A fallback candidate is eligible only if it:

- Is available.
- Satisfies all required capabilities.
- Fits the context requirement.
- Is allowed by company and project policy.
- Fits remaining budget.

If no candidate qualifies, the task transitions to `blocked` with reason `model_unavailable`. Paperclip MUST NOT silently route a vision task to a text-only model or a tool-using task to a model without tool support.

Fallback MUST be visible in the run record and final task summary.

### 10.4 Auto routing

An optional `auto` mode MAY choose a model using:

- Agent preference.
- Task type.
- Required capabilities.
- Context size.
- Expected complexity.
- Current provider availability.
- Price and remaining budget.
- Measured historical success for similar tasks.

Auto routing MUST produce an inspectable decision record. It MUST NOT use an unbounded LLM call merely to choose another LLM.

## 11. Event-Driven Execution

### 11.1 Allowlisted run triggers

The following events MAY create a model run:

| Event | Target | Behavior |
| --- | --- | --- |
| `task.assigned` | Task assignee | Start task work |
| `task.run_requested` | Task assignee | Explicit board or authorized-agent run |
| `task.review_requested` | Authorized reviewer | Review the submitted result |
| `task.mentioned` | Mentioned agent | Respond to explicit `@mention` |
| `human_action.resolved` | Waiting task owner | Resume with the decision delta |
| `routine.occurrence_created` | New task assignee | Execute the newly created task |
| `provider.retry_due` | Same task assignee | Retry a recognized technical failure |
| `external_event.task_created` | New task assignee | Execute a task created by a configured integration |
| `file_reservation.available` | Waiting task owner | Resume after its complete requested file set becomes available |
| `task.dependencies_resolved` | Blocked task owner | Resume after all required tasks complete successfully |
| `task.review_rerouted` | Fallback reviewer | Review after the primary reviewer becomes unavailable |

Any other event MUST be non-executing unless an operator explicitly enables it.

### 11.2 Events that do not create runs

The following MUST NOT create a model run by default:

- Ordinary comments.
- Assignee self-comments.
- Task reads.
- Attachment uploads.
- Cost events.
- Log events.
- Status changes without a corresponding explicit execution event.
- Project-memory maintenance.
- Timer ticks.
- Budget aggregation.
- Secret rotation.

### 11.3 Idempotency

Every executing event MUST have an immutable event ID and idempotency key. The dispatcher MUST guarantee that the same event cannot create two active runs for the same target task and agent.

Suggested key:

```text
companyId:eventKind:eventId:taskId:agentId
```

### 11.4 No periodic model heartbeat

Light mode removes the periodic model heartbeat entirely.

The scheduler remains responsible for deterministic work only:

- Creating routine occurrences.
- Releasing due technical retries.
- Enforcing concurrency.
- Detecting process loss.
- Updating budgets.
- Expiring approvals and temporary grants.
- Maintaining queues and leases.

None of these operations may invoke a model without first producing one of the allowlisted executing events.

## 12. Task Model

### 12.1 Required fields

A Light task requires:

- `title`
- `description`
- `companyId`
- `projectId`
- `assigneeAgentId`
- `status`

Optional fields include:

- `parentTaskId`
- Attachments.
- Review policy.
- Context or model override.
- Origin information for routines or integrations.

Priority and deadline are not required in the Light workflow. If retained for compatibility, they MUST remain optional and MUST NOT affect execution unless an explicit policy uses them.

### 12.2 Status lifecycle

```text
todo ──start──> running ──submit──> in_review ──accept──> done
  │                 │                    │
  │                 │                    └──request changes──> running
  │                 ├──temporary wait──> paused ──resource available──> todo
  │                 ├──logical wait────> blocked ──dependency/action resolved──> todo
  │                 └──retry exhausted─> failed ──human retry──> todo
  └────────────────────────human cancellation────────────────> cancelled
```

Status meanings are strict:

- `paused`: a temporary, mechanically observable resource wait such as a file reservation, provider reset time, configured schedule, or manual pause. No model runs while paused.
- `blocked`: useful work cannot continue because a logical dependency, subtask, required decision, missing information, or unresolved solution owns the next step.
- `failed`: the configured technical retry budget is exhausted. Automatic execution stops and a human action is created.
- `cancelled`: a human intentionally cancelled the task. Cancellation stops execution and prevents automatic resumption.
- `done`: the required output and review policy are satisfied.

`done` and `cancelled` are terminal. `failed` is terminal for automatic execution but may be retried by a human, which creates a new attempt and returns the task to `todo`. `paused` and `blocked` resume only from explicit durable events, never periodic model polling.

### 12.3 Assignment

Task creation and assignment SHOULD be atomic. Assigning a `todo` task to an active agent creates exactly one `task.assigned` event.

Reassigning a running task requires:

- Cancellation or completion of the current run.
- Release of the task execution lease.
- A new assignment event.
- An audit record naming the previous and new assignees.

### 12.4 Subtasks

Agents MAY decompose tasks automatically.

Subtasks:

- Belong to the same company.
- Default to the parent project.
- Preserve a direct parent link.
- May be assigned to different agents.
- May run in parallel subject to concurrency limits.
- Contribute tokens and costs to the parent task tree.

Creating subtasks does not automatically block the parent. The creating agent must choose one of two explicit modes:

- `wait_for_children`: the parent waits for selected children and resumes when all complete.
- `continue_with_children`: the parent continues independently.

This choice is stored as state, not inferred from comments.

Tasks MAY also declare explicit dependencies that are not direct children. Dependency edges and task-tree limits are defined in Section 43.

### 12.5 Completion summary

Before `done`, an agent MUST provide a concise structured summary containing:

- What was done.
- Important checks performed.
- Any meaningful problem encountered and resolved.
- Produced artifacts, commits, pull requests, previews, campaign URLs, or reports.
- Any follow-up worth knowing.
- Model fallback disclosure when relevant.

The summary SHOULD be readable in under one minute. Raw logs remain available separately.

Example:

```json
{
  "summary": "Added passwordless login and corrected the onboarding redirect.",
  "verification": ["Unit tests passed", "Login flow verified locally"],
  "outputs": [
    {"kind": "pull_request", "url": "https://example.test/pull/42"},
    {"kind": "preview", "url": "https://preview.example.test"}
  ],
  "notes": "The existing email provider configuration was reused."
}
```

## 13. Continuous Work Inside a Run

An agent SHOULD perform investigation, editing, testing, linting, and self-correction inside one runtime process whenever possible.

Paperclip MUST distinguish:

- A provider-internal turn or tool call.
- A Paperclip run.
- A Paperclip task continuation.

Provider-internal tool calls MUST NOT create Paperclip wake events. This allows a smaller development model to iterate on implementation and QA without repeatedly reloading company, project, skills, and task context.

A run ends when the agent:

- Submits work for review.
- Completes a self-reviewable task.
- Records a real blocker.
- Requests a human action.
- Encounters a terminal technical failure.
- Is cancelled or times out.

## 14. Agent Review Workflow

### 14.1 Default review policy

Development work SHOULD default to manager-agent review:

1. The worker performs its own tests and basic QA.
2. The worker submits a completion summary and outputs.
3. The task moves to `in_review`.
4. A `task.review_requested` event targets the configured manager or reviewer.
5. The reviewer accepts or requests changes.

Marketing projects MAY use role-specific review chains, for example:

```text
SEO researcher → content writer → editor → marketing manager
```

### 14.2 Review output

A review verdict is structured:

```ts
type ReviewVerdict =
  | { verdict: "accept"; summary: string }
  | { verdict: "changes_requested"; summary: string; requiredChanges: string[] }
  | { verdict: "blocked"; summary: string; owner: string; action: string };
```

### 14.3 Revision context

When changes are requested, the worker receives only:

- The previous completion summary.
- The review verdict.
- Required changes.
- Any new attachments or explicit references.
- The compact task state.

Paperclip MUST NOT resend the complete review history unless explicitly requested.

### 14.4 Review-loop bound

The default maximum is three review cycles. The limit is configurable by project or agent.

After the limit:

- The reviewer may accept.
- The task may be reassigned.
- A manager may decompose the remaining work.
- A human action may be requested.

Paperclip MUST NOT continue an unbounded reviewer/worker loop.

## 15. Comments and Agent Collaboration

### 15.1 Ordinary comments

An ordinary comment records information but does not wake an agent.

### 15.2 Explicit mentions

An explicit `@agent` mention MAY create one `task.mentioned` event for that agent if:

- The author is authorized to request input from the target.
- The target can read the task.
- No equivalent unresolved mention exists.
- The per-task mention budget has not been exceeded.

The mentioned agent receives the mention, a compact task summary, and only the immediately relevant attachments or references.

### 15.3 Mentions are not assignment

A mention requests input. It does not transfer task ownership, grant a secret, grant workspace access, or authorize task completion.

### 15.4 Mention-loop prevention

- An agent self-mention creates no event.
- Repeating the same normalized mention without new external information is deduplicated.
- Agents may not recursively mention each other more than the configured collaboration depth.
- The default maximum is five cross-agent mention runs per task tree.

For substantial work, agents SHOULD create and assign a subtask instead of conducting a long comment conversation.

## 16. Routines

### 16.1 Routine semantics

A routine is a deterministic task factory. It does not directly create a special model execution.

Each occurrence:

1. Resolves the current routine revision.
2. Creates one normal task.
3. Records routine and occurrence provenance.
4. Assigns the task to the configured agent.
5. Emits a normal `task.assigned` event.

### 16.2 Routine task template

A routine defines:

- Title template.
- Description template.
- Project.
- Assignee.
- Optional parent task.
- Attachments or external-event references.
- Schedule, API, or webhook trigger.
- Concurrency policy.
- Retry policy.
- Optional model override.

### 16.3 Overlapping occurrence policy

The Light default maps to the native routine policy `skip_if_active`: the new occurrence is recorded as skipped with an explicit conflict instead of starting duplicate work.

If a new occurrence fires while a prior occurrence is non-terminal:

- No task is launched.
- The occurrence is recorded as `conflict`.
- The UI explains which active task caused the conflict.
- The routine itself remains active unless policy says otherwise.

Optional future policies MAY include:

- `skip_if_active`
- `queue_if_active`
- `allow_parallel`

No policy may be inferred from model output.

### 16.4 Missed occurrences

The default catch-up policy is `skip_missed`. Catch-up behavior MUST be bounded and MUST NOT produce an unbounded task backlog after server restart.

## 17. Human Action Center

### 17.1 Purpose

All required human intervention is consolidated into one company-level `Actions` surface. Humans SHOULD NOT need to discover pending decisions across task comments, approvals, recovery issues, and raw logs.

### 17.2 Action card

Each card includes:

- Plain-language action title.
- One-sentence summary.
- Requesting agent.
- Company and project.
- Linked task.
- Requested action type.
- Risk classification.
- Relevant bounded evidence.
- Expiration, if any.
- Consequence of approval and refusal.

### 17.3 Standard actions

The UI SHOULD provide contextual actions such as:

- `Approve`
- `Reject`
- `Approve once`
- `Always allow in this scope`
- `Request changes`
- `Comment`

`Always allow in this scope` is available only for action classes that company policy marks as eligible for standing authorization. It MUST NOT be offered for payments, irreversible deletion, or outbound communication that requires a fresh human decision for each occurrence.

### 17.4 Governed action classes

Default human approval is recommended for:

- Payments and financial commitments.
- Irreversible deletion.
- External email or message sending.
- Public publication.
- Production deployment when enabled by project policy.
- External account creation.
- Permission elevation.
- Secret creation, rotation, attachment, or disclosure policy changes.
- Hiring, terminating, or structurally reconfiguring agents.

Each action class is configurable at company and project scope. A more specific project policy may be stricter but MUST NOT silently weaken a company hard requirement.

### 17.5 Resumption

Resolving an action creates exactly one `human_action.resolved` event. The resumed agent receives only:

- The decision.
- Human note.
- Approved scope and duration.
- Any changed parameters.
- Compact task state.

## 18. Secrets and Private-Key Tools

### 18.1 Secret scopes

Paperclip Light supports:

- Company secrets.
- Project secrets.

Task-level secrets are out of scope.

Company secrets are reusable within the company but confer no access until granted. Project secrets are available only within their project and still require an authorized consumer.

### 18.2 Secret grants

A secret grant binds a secret to:

- One agent.
- Optionally one project.
- One or more permitted configuration paths or tool aliases.
- A version policy (`latest` or pinned).
- Optional expiration.
- Optional usage restrictions.

Suggested model:

```ts
interface AgentSecretGrant {
  companyId: string;
  secretId: string;
  agentId: string;
  projectId: string | null;
  allowedBindings: string[];
  version: "latest" | number;
  expiresAt: string | null;
  createdBy: ActorRef;
  approvedBy: ActorRef | null;
}
```

### 18.3 Resolution precedence

When the same runtime key exists at multiple scopes:

1. Runtime-owned `PAPERCLIP_*` values are protected and cannot be overridden.
2. An explicitly granted project binding overrides a company default binding.
3. Ambiguous same-scope bindings fail closed.

The UI MUST show the effective binding without revealing its value.

### 18.4 Runtime delivery

Secret values MUST NOT appear in prompts. Paperclip resolves a secret immediately before execution and delivers it through an approved channel:

- Process environment variable.
- Sandboxed file descriptor or temporary file.
- HTTP authorization field.
- MCP or tool-runtime credential slot.
- Server-side proxy action.

Temporary secret material SHOULD be removed when the run exits.

### 18.5 Proxy tools

For high-risk credentials, Paperclip SHOULD prefer server-side proxy tools. Instead of exposing an email, payment, or advertising-platform key, Paperclip can expose actions such as:

- `send_email`
- `create_payment`
- `publish_campaign`
- `deploy_production`

The tool performs authorization, approval, parameter validation, rate limiting, and logging without exposing the underlying secret to the model process.

### 18.6 Delegation rule

Possessing or using a secret does not grant the right to delegate it. Managers MUST NOT attach secrets to subordinates unless they hold a distinct secret-administration permission and satisfy any approval policy.

### 18.7 Secret audit

Every resolution attempt records:

- Company.
- Project.
- Agent.
- Task.
- Run.
- Secret ID and version.
- Binding or proxy action.
- Outcome.
- Timestamp.

It MUST NOT record the secret value, decrypted payload, or provider credentials.

### 18.8 Redaction

The runtime log pipeline MUST redact:

- Exact known secret values.
- Common encoded variants when feasible.
- Sensitive environment variables.
- Authorization headers.
- Provider-specific credential formats.

Redaction is defense in depth. Operators must assume that a secret delivered to an agent process is accessible to that process and limit blast radius accordingly.

## 19. Skills

### 19.1 Assignment

Only skills explicitly attached to an agent are eligible for use. A project MAY further restrict the eligible set but MUST NOT expand it beyond the agent grant.

### 19.2 Loading policy

Skill loading follows progressive disclosure:

1. The agent receives names and short descriptions only for its attached skills.
2. A deterministic selector identifies skills relevant to the task.
3. Selected skill bodies are loaded on demand.
4. Unselected skill bodies never enter the model context.

The full company skill catalog MUST NOT be injected into every agent prompt.

Runtime-native discovery is subject to the same rule. A provider MUST NOT re-add global, plugin, or repository skills after Paperclip has selected the task skill set. The Codex ACP integration enforces this with a run-scoped `skills.config` allowlist: selected materialized skill paths are enabled and discovered ambient skill paths from the managed home, plugins, user home, and project ancestry are disabled. The generated policy is part of the session identity so a skill-set change cannot reuse a stale session.

### 19.3 Operational skill

Legacy runtimes may use a short Paperclip CLI skill. Native runtimes SHOULD receive structured Paperclip actions and require no operational skill.

The Light operational skill SHOULD remain below:

- 40 lines.
- 500 words.
- 700 estimated tokens.

It covers only task read, task creation, comments, completion, blocking, and review.

### 19.4 Skill permissions

A skill may describe how to use a capability, but it cannot grant:

- A secret.
- Network access.
- Filesystem access.
- A Paperclip permission.
- A higher budget.
- Authority to approve a governed action.

## 20. Context Architecture

### 20.1 Context components

Every run context is assembled from independently measured components:

```ts
interface ContextBreakdown {
  roleInstructionsTokens: number;
  projectBriefTokens: number;
  projectMemoryTokens: number;
  skillManifestTokens: number;
  selectedSkillsTokens: number;
  taskTokens: number;
  eventDeltaTokens: number;
  continuationSummaryTokens: number;
  providerHistoryTokens: number;
  paperclipProtocolTokens: number;
  totalEstimatedTokens: number;
}
```

### 20.2 Fresh task context

A fresh task includes:

- Short execution header with task and run IDs.
- Agent role instructions.
- Project brief.
- Bounded project memory.
- Selected skill bodies.
- Task title and description.
- Directly attached inputs.
- At most two recent external comments when relevant.

It excludes by default:

- Entire ancestor descriptions.
- Complete comment history.
- All company skills.
- Recovery metadata.
- Other tasks assigned to the agent.
- Raw logs from previous tasks.

### 20.3 Continuation context

A resumed task includes:

- Compact task state.
- Server-owned continuation summary.
- The event delta that caused resumption.
- New or changed outputs referenced by the event.
- Relevant selected skills only when not already available to the runtime.

### 20.4 Context budgets

Suggested default budgets:

| Component | Default maximum |
| --- | ---: |
| Paperclip execution protocol | 700 tokens |
| Project brief | 800 tokens |
| Project memory | 1,500 tokens |
| Task description | 4,000 tokens |
| Event delta | 1,500 tokens |
| Recent comments | 1,000 tokens |
| Continuation summary | 1,000 tokens |
| Skill manifest | 400 tokens |

Selected domain skills have a separate configurable budget because their size depends on the task.

If context exceeds the model limit, Paperclip MUST reduce optional components deterministically and explain the truncation in the run record. It MUST NOT silently truncate the event delta or required task instructions.

### 20.5 Deduplication

The same text MUST NOT appear in multiple prompt components. Each component receives a stable content hash. The context builder SHOULD reject or remove exact duplicates and flag high-similarity duplicates for inspection.

## 21. Project Memory

### 21.1 Purpose

Project memory prevents agents from starting from zero without retaining complete task transcripts.

It contains durable facts such as:

- Technology stack.
- Repository conventions.
- Product constraints.
- Deployment process.
- Marketing voice and positioning.
- Important external URLs.
- Stable decisions.
- Known hazards.

### 21.2 Memory item

```ts
interface ProjectMemoryItem {
  id: string;
  projectId: string;
  text: string;
  category: "architecture" | "workflow" | "product" | "marketing" | "decision" | "constraint" | "other";
  importance: number;
  confidence: number;
  sourceTaskId: string | null;
  sourceRunId: string | null;
  createdAt: string;
  lastConfirmedAt: string;
  expiresAt: string | null;
  status: "active" | "superseded" | "expired";
}
```

### 21.3 Memory selection

Selection considers:

- Relevance to task and agent role.
- Importance.
- Confidence.
- Recency.
- Explicit pinning.
- Contradiction or supersession.

Age reduces ranking but does not automatically remove a still-valid pinned constraint.

### 21.4 Memory writes

Agents MAY propose memory items. A deterministic service validates size, provenance, duplicates, and conflicts. Manager or human review MAY be required for high-impact categories such as deployment, security, billing, or brand policy.

Task comments and summaries are not automatically copied into memory.

### 21.5 Memory budget

The selected memory injected into a run SHOULD remain between 1,000 and 2,000 tokens. Full memory remains searchable through tools.

## 22. Session Compaction and Rotation

### 22.1 Default policy

Suggested Light defaults:

- One session per task.
- Rotate after six Paperclip runs.
- Rotate after 100,000 raw input tokens.
- Rotate after 24 hours of active task time.
- Compact before rotation to at most 1,000 tokens.

These limits apply even when a provider advertises native context management.

### 22.2 Compaction output

A continuation summary includes:

- Current objective.
- Completed work.
- Current files or artifacts.
- Verification already performed.
- Outstanding reviewer requests.
- Current blocker or next action.
- Important decisions not already in project memory.

It MUST NOT include full transcripts or secret values.

### 22.3 Cross-task memory

Provider sessions MUST NOT serve as cross-task memory. Durable cross-task information belongs in project memory or explicit artifacts.

## 23. Concurrency and Scheduling

### 23.1 Limit hierarchy

Concurrency is configurable at:

- Host.
- Runtime or provider.
- Company.
- Project.
- Agent.

The effective limit is the lowest applicable available capacity.

### 23.2 Weighted slots

A run MAY consume multiple weighted slots. Example:

```text
remote API agent       weight 1
small local model      weight 1
large local model      weight 2
GPU-heavy vision model weight 4
```

Weights allow one host-level limit to represent heterogeneous resource cost.

### 23.3 Queue behavior

When capacity is unavailable:

- The run request remains queued.
- No model process starts.
- Queue position and blocking limit are visible.
- Duplicate events are coalesced by idempotency key.
- The task remains `todo` until execution actually starts.

### 23.4 Fairness

The scheduler SHOULD prevent one project or agent from starving the rest of a company. A weighted fair queue across companies and projects is recommended.

## 24. Retry and Failure Policy

### 24.1 Technical retry

The default is two retries after the initial failed attempt. The value is configurable by company, project, agent, or adapter.

Retry is permitted only for recognized technical failures such as:

- Provider connection loss.
- Rate limiting with a bounded retry time.
- Temporary provider unavailability.
- Process crash.
- Transient network failure.
- Recoverable remote-runner failure.

### 24.2 Non-retryable failure

Automatic retry is forbidden for:

- Permission denial.
- Missing secret grant.
- Invalid task input.
- Unsupported model capability.
- Budget hard stop.
- Rejected human action.
- Deterministic test failure caused by the produced work.
- Repeated identical provider error after the configured limit.

### 24.3 Retry context

A retry receives:

- Failure classification.
- Sanitized error summary.
- Durable outputs from prior attempts.
- Compact continuation summary when available.

It MUST NOT receive duplicated full logs unless explicitly requested.

### 24.4 Exhaustion

After retry exhaustion:

- The task moves to `failed` for a technical failure.
- Or to `blocked` when a named external action can resolve it.
- No recovery model is launched.
- A concise human action is created with the exact failure reason, attempts already made, and recommended next action.
- A manager or human may manually retry, reassign, change provider, or cancel.

## 25. Minimal Agent CLI

### 25.1 Goals

The CLI is a stable agent interface, not a mirror of every REST resource. It MUST use human-readable identifiers, infer company and actor context, return compact output, and provide atomic commands for common dispositions.

The proposed binary name is `pc`, with `paperclipai light` as a compatibility alias if needed.

### 25.2 Core commands

```sh
pc task list --mine
pc task show COM-1

pc task create "Implement passwordless login" --to backend --project saas-alpha
pc task create "Research competitor keywords" --to seo --parent MKT-42

pc task comment COM-1 "The preview is ready for review"
pc task mention COM-1 @designer "Can you review the empty state?"
pc task attach COM-1 ./report.md

pc task submit COM-1 "Implemented and verified locally"
pc task done COM-1 "Approved and complete"
pc task block COM-1 --reason "Missing production domain" --owner human
pc task fail COM-1 --reason "Provider failed after two retries"
pc task pause COM-1 --reason "Waiting for an available file reservation"
pc task cancel COM-1 --cascade
pc task depend COM-1 --on COM-2 --mode required_success

pc review accept COM-1 "Implementation and tests look good"
pc review changes COM-1 "Add the missing mobile test" --item "Test 390px layout"

pc agent list
pc agent show backend
pc skill list --mine
pc secret list --available
pc run COM-1
```

### 25.3 Atomicity

- `task create --to` creates, assigns, and emits one assignment event.
- `task submit` writes the completion summary, moves to `in_review`, and emits one review event.
- `task done` writes the summary and terminal status atomically.
- `task block` writes status, reason, owner, and required action atomically.
- `review changes` writes one verdict and one worker-resume event atomically.

### 25.4 Identifier resolution

The CLI SHOULD accept:

- Task identifiers such as `COM-1`.
- Agent names or unique slugs such as `backend`.
- Project slugs such as `saas-alpha`.

Ambiguous names fail with a compact list of valid matches. Agents should not need raw UUIDs during normal work.

### 25.5 Output modes

- Agent runtime: compact JSON by default.
- Human terminal: concise text by default.
- `--full`: complete task payload when diagnostic detail is actually needed.
- Task mutations return only identity, disposition, and deliverable confirmation fields.
- Errors: stable code, one-line explanation, and actionable remediation.

### 25.6 Environment

Paperclip injects:

```text
PAPERCLIP_API_URL
PAPERCLIP_AGENT_ID
PAPERCLIP_COMPANY_ID
PAPERCLIP_PROJECT_ID
PAPERCLIP_TASK_ID
PAPERCLIP_RUN_ID
PAPERCLIP_API_KEY
```

The CLI uses these values automatically. Authentication material MUST NOT appear in CLI output.

### 25.7 Runtime delivery and preflight

`pc` MUST be a harness-delivered capability, not an installation assumption hidden in an agent prompt. For local CLI adapters, the server copies a dependency-free Light client into the run-owned scratch directory, prepends its private `bin` directory to `PATH`, and injects the task, project, company, run, API URL, and ephemeral run credential. This behavior is identical for OpenCode, Codex, Claude Code, Gemini CLI, Grok, and custom local-process adapters.

The copied client contains no credential. It reads the short-lived credential from the process environment and never prints it. The scratch copy is deleted with the terminal run.

If the harness cannot create or expose `pc`, a Light run MUST fail before model dispatch with an actionable preflight error. Falling back to a long REST manual, public web research, or repeated trial-and-error is forbidden because it spends tokens while the operational contract is already known to be broken.

The runtime sandbox must also be able to reach the injected local control-plane URL. In the Codex ACP lane, an agent configuration that already opts into `dangerouslyBypassApprovalsAndSandbox` is mapped to the ACP startup mode `agent-full-access`; this preserves parity with the Codex CLI lane and prevents repeated network approval turns. This mapping does not grant broader access to an agent that did not opt in. A confined Codex configuration instead requires a native Paperclip bridge or an explicit loopback-capable sandbox policy; if neither is available, preflight must fail before model dispatch.

Remote or cloud runtimes MUST receive either the same client through the environment's staging mechanism or equivalent native structured actions. A runtime that receives neither is incompatible with Light mode and must also fail before model dispatch.

Project preflight MUST additionally expose `PAPERCLIP_PROJECT_ID` and validate that a code task resolves to a real configured project workspace. A generated empty fallback directory is not an acceptable substitute when the project claims to be linked to a repository. The failure message names the project and tells the human to set a local folder or repository URL.

## 26. Short Operational Skill

A legacy agent may receive the following complete Paperclip skill:

```md
# Paperclip CLI

Work only on the assigned task and authorized subtasks.

1. Read the task with `pc task show <id>`.
2. Before editing repository files, reserve the complete write set with
   `pc files reserve <id> <paths...>`.
3. Do the work now; use your tools and run your own checks.
4. Commit and push only through the `pc repo` broker commands.
5. Delegate specialized work with
   `pc task create "<title>" --to <agent> --parent <id>`.
6. Use `pc task comment` only for useful durable information.
7. Publish each file deliverable with `pc task attach <id> <path>`.
8. Finish with exactly one action:
   - `pc task submit <id> "<summary>"` when review is required.
   - `pc task done <id> "<summary>"` when self-completion is allowed.
   - `pc task block <id> --reason "<reason>" --owner <owner>`.

Make reversible assumptions when safe. Research or delegate before asking a
human. Never poll a task or wake another agent repeatedly. A mention requests
input; a subtask requests work. Only use skills and secrets granted to you.
```

Native runners SHOULD expose equivalent structured actions and omit this skill.

## 27. API Surface

The Light CLI may use existing REST resources internally, but a small semantic API is recommended.

### 27.1 Tasks

```text
GET  /api/light/tasks?mine=true
GET  /api/light/tasks/:id
POST /api/light/tasks
POST /api/light/tasks/:id/comments
POST /api/light/tasks/:id/mentions
POST /api/light/tasks/:id/submit
POST /api/light/tasks/:id/complete
POST /api/light/tasks/:id/block
POST /api/light/tasks/:id/fail
POST /api/light/tasks/:id/run
```

### 27.2 Reviews

```text
POST /api/light/tasks/:id/reviews/request
POST /api/light/tasks/:id/reviews/accept
POST /api/light/tasks/:id/reviews/request-changes
```

### 27.3 Agents and capabilities

```text
GET /api/light/agents
GET /api/light/agents/:id
GET /api/light/agents/:id/skills
GET /api/light/agents/:id/available-secrets
```

### 27.4 Human actions

```text
GET  /api/light/companies/:companyId/actions
POST /api/light/actions/:id/approve
POST /api/light/actions/:id/reject
POST /api/light/actions/:id/request-changes
POST /api/light/actions/:id/comment
```

### 27.5 Runs and cost

```text
GET /api/light/runs/:id
GET /api/light/runs/:id/events
GET /api/light/tasks/:id/costs?includeChildren=true
GET /api/light/projects/:id/costs
GET /api/light/companies/:id/costs
```

### 27.6 File reservations and repository operations

```text
GET  /api/light/projects/:id/repository
GET  /api/light/projects/:id/file-reservations
POST /api/light/tasks/:id/file-reservations/acquire
POST /api/light/tasks/:id/file-reservations/release
GET  /api/light/tasks/:id/repository-diff
POST /api/light/tasks/:id/repository-validate
POST /api/light/tasks/:id/repository-commit
POST /api/light/tasks/:id/repository-push
```

These endpoints invoke the reservation and repository brokers. They do not expose unrestricted shell command execution.

All mutations MUST enforce company ownership, actor authorization, task/run binding, and activity logging.

## 28. Observability and Cost Accounting

### 28.1 Run usage record

Each run records both raw provider usage and normalized per-run usage:

```ts
interface RunUsage {
  provider: string;
  model: string;
  rawInputTokens: number | null;
  rawCachedInputTokens: number | null;
  rawOutputTokens: number | null;
  normalizedInputTokens: number;
  normalizedCachedInputTokens: number;
  normalizedOutputTokens: number;
  reportedCostCents: number | null;
  estimatedCostCents: number | null;
  durationMs: number;
  toolCallCount: number;
  contextBreakdown: ContextBreakdown;
}
```

Normalized usage prevents cumulative provider session counters from being counted again on every run.

### 28.2 Cost hierarchy

Costs aggregate as:

```text
Run
└── Task own cost
    └── Task-tree cost, including all descendants
        └── Project cost
            └── Agent cost
                └── Company cost
```

Agent and project views are separate dimensions; neither replaces task attribution.

### 28.3 Task cost display

A parent task SHOULD display:

```text
Own runs             42,100 tokens
Child tasks         138,400 tokens
Task-tree total     180,500 tokens
Cached input         74,200 tokens
Estimated API cost       1.84 EUR
Runtime duration          48 min
```

### 28.4 Local model accounting

When monetary cost is unavailable, Paperclip still records:

- Input and output tokens.
- Cached tokens when reported.
- Wall-clock duration.
- CPU or GPU duration when available.
- Peak memory when available.
- Adapter and model.

### 28.5 Token diagnostics

The cost UI MUST answer:

- Which tasks consumed the most tokens?
- Which agents and models are most expensive?
- How much was task work versus Paperclip overhead?
- Which skills and memories were loaded?
- Which runs were retries or fallbacks?
- Which sessions exceeded context policy?
- Which runs produced no durable result?
- How many tokens were consumed by each task tree?

### 28.6 Run logs

Paperclip retains detailed run events:

- Process lifecycle.
- Sanitized stdout and stderr.
- Provider messages when available.
- Tool calls and results.
- Paperclip CLI actions.
- Context-component sizes and hashes.
- Model routing decisions.
- Secret-resolution event references.
- Retry and fallback decisions.
- Final normalized result.

Logs MUST be bounded by retention policy and redacted before persistence. Detailed run logs and provider transcripts are retained for 30 days by default and then automatically deleted. Full raw transcripts MAY be optional because they can contain sensitive or costly data. Durable summaries, task records, cost aggregates, output metadata, approval decisions, and security audit records use their own longer-lived retention rules defined in Section 49.

## 29. Budgets

Budget policies MAY exist at:

- Company.
- Project.
- Agent.
- Task tree.
- Run.

Supported limits SHOULD include:

- Monetary spend.
- Input tokens.
- Output tokens.
- Total tokens.
- Runtime duration.
- Number of runs.
- Number of retries.

Budget behavior:

- Soft threshold: warning and dashboard signal.
- Hard threshold: no new run starts.
- Active runs may be allowed to finish or cancelled according to policy.
- A hard stop creates a `blocked` task state with reason `budget_exhausted`, not a retry loop.
- Human budget override is processed through the Action Center.

## 30. User Interface

### 30.1 Primary navigation

Recommended Light navigation:

```text
Overview
Projects
Tasks
Agents
Routines
Actions
Skills
Secrets
Costs
Activity
Settings
```

### 30.2 Task page

The task page prioritizes:

- Title, project, assignee, and status.
- Parent and child tasks.
- Current run or reviewer.
- Concise description.
- Relevant comments and mentions.
- Outputs and completion summary.
- Reserved files, waiting file requests, checkpoints, dependencies, and repository outputs.
- Own cost and task-tree cost.
- Expandable run logs.

Advanced execution metadata remains behind a diagnostic disclosure.

### 30.3 Agent page

The agent page includes:

- Role and org position.
- Runtime and model routing.
- Capability tags.
- Assigned skills.
- Secret grants by name and scope.
- Current tasks.
- Review queue.
- Concurrency and retries.
- Costs and success metrics.
- Recent runs and errors.

Secret values are never shown.

### 30.4 Cost page

The cost page supports filters by:

- Company.
- Project.
- Agent.
- Model.
- Provider.
- Task and task tree.
- Date range.
- Run reason.
- Retry or fallback status.

### 30.5 Progressive disclosure

The default surface shows human-readable intent, outcome, cost, and required action. Raw logs, context breakdown, model messages, and audit events are available one level deeper.

### 30.6 Project repository page

The project surface SHOULD show:

- Repository URL and shared checkout health.
- Active working branch.
- Allowed push and merge branches.
- Current commit and remote synchronization state.
- Active, waiting, and orphaned file reservations.
- Repository operation queue.
- Required validation commands and latest result.
- Push, merge, and production approval policy.
- Storage usage and retained checkpoints.

## 31. Data Model Additions

Paperclip Light may reuse current company, project, agent, issue, routine, secret, run, and cost tables. The following concepts require explicit persistence, either through new tables or versioned JSON contracts:

### 31.1 Execution events

```text
light_execution_events
- id
- company_id
- project_id
- task_id
- target_agent_id
- kind
- idempotency_key
- payload
- status: pending | claimed | dispatched | completed | cancelled | conflict
- created_at
- claimed_at
- completed_at
```

### 31.2 Reviews

```text
task_reviews
- id
- company_id
- task_id
- revision
- requested_by_agent_id
- reviewer_agent_id
- status: pending | accepted | changes_requested | blocked | cancelled
- summary
- required_changes
- source_run_id
- decided_run_id
- created_at
- decided_at
```

### 31.3 Project memory

```text
project_memory_items
- id
- company_id
- project_id
- category
- text
- importance
- confidence
- source_task_id
- source_run_id
- last_confirmed_at
- expires_at
- status
```

### 31.4 Agent secret grants

Existing secret bindings may be extended to make agent, project, binding, expiry, approver, and allowed-use scope explicit.

### 31.5 Human actions

```text
human_actions
- id
- company_id
- project_id
- task_id
- requesting_agent_id
- requesting_run_id
- action_kind
- risk_level
- summary
- payload
- resolver_policy
- status
- decision
- decided_by_user_id
- expires_at
- created_at
- decided_at
```

### 31.6 Context ledger

```text
run_context_components
- id
- company_id
- run_id
- component_kind
- source_entity_type
- source_entity_id
- content_hash
- char_count
- estimated_tokens
- included
- exclusion_reason
```

This ledger is critical for diagnosing token consumption.

## 32. Security Model

### 32.1 Boundaries

Hard boundaries include:

- Company ownership.
- Authenticated actor identity.
- Agent-to-run binding.
- Task-to-project binding.
- Secret grants.
- Workspace permissions.
- Network and tool policies.
- Budget and approval gates.

Prompt instructions can narrow behavior but cannot widen these boundaries.

### 32.2 Least privilege

Agents receive only:

- Projects they may work on.
- Skills attached to them.
- Secrets explicitly granted for the current project.
- Tools allowed by policy.
- Task context required for the run.

### 32.3 Network and filesystem policy

Company or project policy SHOULD be able to define:

- Allowed network domains.
- Denied network destinations.
- Workspace roots.
- Read-only and writable paths.
- Allowed command classes.
- Whether browser automation is available.
- Whether production systems are accessible.

### 32.4 Prompt injection

External content, task attachments, web pages, emails, and retrieved documents are untrusted data. They MUST NOT be allowed to grant Paperclip permissions, secrets, or governed actions. Tool and secret authorization occurs outside the model.

### 32.5 Auditability

Every state mutation records actor, company, project, task, run, action, target, and outcome. Audit failure on a governed mutation SHOULD fail the mutation closed.

## 33. Reliability Invariants

Paperclip Light preserves three core invariants:

1. **Productive work continues.** Assignment, explicit resumption, review, and bounded technical retries remain reliable across restarts.
2. **Only real blockers stop work.** A blocked task names a reason, an owner, and a required action.
3. **No infinite loops.** Every event is idempotent, every retry and review loop is bounded, and no agent comment can recursively wake itself.

Additional invariants:

- One active execution lease per task.
- One active run per execution event.
- No provider process starts without capacity and budget.
- No secret is resolved without a current grant.
- No task crosses a company boundary.
- No automatic recovery creates a new category of model work.
- Restarts may re-dispatch an unacknowledged event but may not duplicate a completed event.

## 34. Migration from Full Paperclip

### 34.1 Feature flag

Light mode SHOULD launch behind:

```json
{
  "executionProfile": "light"
}
```

The setting may initially be company-wide, then optionally overridable by project or agent.

### 34.2 Compatibility strategy

Light mode reuses existing records where possible:

- Companies and projects remain unchanged.
- Agents retain their adapters, instructions, org positions, and budgets.
- Issues remain the task storage model.
- Existing routines are adapted to create normal tasks.
- Existing company secrets and provider vaults remain valid.
- Existing run and cost records remain readable.

### 34.3 Disabled paths in Light mode

The following paths are disabled for Light tasks:

- Timer-based model heartbeat.
- Legacy mandatory operational skill.
- Automatic comment wake without explicit mention or resume action.
- General continuation inference.
- LLM-driven status repair.
- Recursive source-scoped recovery.
- Automatic watchdog model runs.

Existing advanced data remains readable and manageable from compatibility surfaces.

### 34.4 Migration assistant

Before enabling Light mode, a migration preview SHOULD report:

- Agents with periodic heartbeats.
- Agents using legacy mandatory Paperclip skills.
- Routines whose current behavior does not create normal tasks.
- Tasks depending on monitors or recovery actions.
- Agent instructions containing duplicated operational boilerplate.
- Skills exceeding context budgets.
- Sessions that cross task boundaries.
- Secret bindings that are not explicit per agent/project.
- Projects currently using per-task worktrees or branches.
- Repositories with a dirty checkout, active merge/rebase state, or remote divergence.
- Active tasks whose edited paths cannot be attributed safely before file reservations are enabled.

The assistant proposes changes but MUST NOT silently alter agent authority, secret grants, repository history, active branches, or uncommitted files. Enabling the shared-checkout mode requires a clean or explicitly checkpointed repository state.

## 35. Delivery Plan

### Phase 0 — Measurement baseline

- Normalize provider usage counters.
- Add the context-component ledger.
- Add run-reason and session-reuse telemetry.
- Establish representative development and marketing benchmarks.

Exit criterion: per-run and per-task token totals are trustworthy.

### Phase 1 — Minimal CLI and short skill

- Implement the semantic `pc` commands.
- Add atomic task dispositions.
- Resolve names and slugs without UUIDs.
- Produce compact machine output.
- Replace the legacy operational skill for Light agents.

Exit criterion: an agent can create, delegate, comment, submit, review, complete, and block work using the short skill only.

### Phase 2 — Light context builder

- Implement context components and budgets.
- Add deduplication and hashes.
- Enforce task-isolated sessions.
- Add compact continuation summaries.
- Load only relevant assigned skills.

Exit criterion: prompt composition is inspectable and bounded across all supported adapters.

### Phase 2B — Shared repository coordination

- Add project repository policy and the managed shared checkout.
- Add strict file reservations and path enforcement.
- Add task checkpoints for pause, crash, and synchronization.
- Add the serialized Git commit, validation, push, and merge broker.
- Add branch allowlists and production delivery approval policy.
- Add repository and file-reservation UI surfaces.

Exit criterion: multiple agents can safely edit disjoint files while crossed writes, mixed commits, unsafe branch changes, and silent orphan-lock reuse are prevented.

### Phase 3 — Event dispatcher

- Add allowlisted execution events.
- Disable periodic model heartbeats for Light agents.
- Implement exact-once dispatch semantics.
- Add comment and mention rules.
- Add configurable weighted concurrency.

Exit criterion: idle companies consume zero model tokens and every run has one explicit cause.

### Phase 4 — Reviews and autonomous collaboration

- Implement structured manager-agent review.
- Add revision deltas.
- Add subtask wait/continue modes.
- Add mention budgets and deduplication.

Exit criterion: a software task can flow worker → manager review → correction → completion without human intervention.

### Phase 5 — Secrets and Action Center

- Add explicit agent/project secret grants.
- Add proxy-tool support for sensitive actions.
- Consolidate human actions.
- Add fast contextual decisions and exact resumption events.

Exit criterion: agents can use private-key tools safely and governed actions pause only for the required decision.

### Phase 6 — Project memory and model routing

- Add compact project memory.
- Add model capability registry.
- Add equivalent-model fallback.
- Add inspectable auto routing.

Exit criterion: OpenCode and open-source model agents can execute the same workflows with provider-neutral behavior.

### Phase 7 — Cost and optimization dashboard

- Add recursive task-tree rollups.
- Add context attribution charts.
- Add retry, fallback, and no-result diagnostics.
- Add local-model compute metrics where available.

Exit criterion: an operator can identify the cause of token waste from the UI without reading raw database records.

## 36. Testing Strategy

### 36.1 Unit tests

- Context budgets and deterministic truncation.
- Context deduplication.
- Model capability matching.
- Fallback selection.
- Event idempotency.
- Status transitions.
- Org-subtree delegation.
- Secret-grant evaluation.
- Routine conflict behavior.
- Retry classification and exhaustion.
- Cost normalization and aggregation.
- Memory selection and supersession.

### 36.2 Adapter conformance tests

Every adapter MUST pass the same scenarios:

- Fresh task execution.
- Structured task completion.
- Session resume where supported.
- New-session continuation where resume is unsupported.
- Cancellation.
- Timeout.
- Provider disconnect.
- Usage collection.
- Secret injection without prompt inclusion.
- Compact CLI or structured tool access.

### 36.3 Integration tests

- Assignment creates exactly one run.
- Ordinary comment creates no run.
- Explicit mention wakes only the mentioned agent.
- Review request wakes only the reviewer.
- Changes requested resumes only the worker.
- Routine creates one normal task.
- Active routine occurrence causes conflict under default policy.
- Two technical retries occur, then execution stops.
- Provider fallback respects capabilities.
- Secret use is allowed only for the granted agent and project.
- Parent cost includes all descendants exactly once.
- Server restart does not duplicate events or routine tasks.

### 36.4 End-to-end software scenario

1. A manager assigns a feature to a development agent using an open-source model through OpenCode.
2. The agent edits code, runs tests, corrects failures, and submits once.
3. The manager agent reviews with a stronger model.
4. The manager requests one bounded correction.
5. The worker resumes with only the review delta.
6. The manager accepts.
7. The task tree shows outputs, tokens, cost, and logs.

### 36.5 End-to-end marketing scenario

1. A routine creates a weekly SEO task.
2. The marketing manager delegates keyword research and competitor research as parallel subtasks.
3. Research agents use their assigned web tools and project secrets.
4. A writer produces a draft.
5. An editor reviews it.
6. Publication requests a human action if project policy requires approval.
7. The parent task shows the complete campaign cost.

## 37. Success Metrics

Initial product targets:

- Zero LLM tokens consumed while no executable event exists.
- Fewer than 1,000 tokens of Paperclip-specific overhead on a fresh run, excluding agent instructions, task content, project memory, and selected domain skills.
- Fewer than 300 tokens of Paperclip-specific delta overhead on a simple resumed run.
- Median of one Paperclip run for a simple task.
- 95th percentile of no more than two runs for simple non-review tasks.
- No task receives more technical retries than configured.
- No skill body is loaded unless attached and selected.
- No provider session crosses a task boundary.
- 100% of runs have an explicit, inspectable trigger event.
- 100% of secret resolutions have an audit event.
- 100% of task costs are attributable to a project, agent, and task tree.
- Development and marketing benchmark workflows reduce normalized input tokens by a target of 70–90% compared with the current full execution profile, without reducing completion quality.

The reduction range is a target, not a guarantee. Phase 0 measurements determine the final baseline and release gate.

## 38. Default Configuration

Suggested initial Light defaults:

```json
{
  "executionProfile": "light",
  "execution": {
    "periodicModelHeartbeat": false,
    "commentWakePolicy": "explicit_mentions_only",
    "maxTechnicalRetries": 2,
    "maxReviewCycles": 3,
    "taskSessionIsolation": true,
    "maxSessionRuns": 6,
    "maxSessionInputTokens": 100000,
    "maxSessionAgeHours": 24
  },
  "tasks": {
    "maxDepth": 4,
    "maxDirectChildren": 12,
    "maxTreeTasks": 50,
    "maxConcurrentTreeRuns": 8
  },
  "workspace": {
    "mode": "shared_checkout_with_file_reservations",
    "strictWriteEnforcement": true,
    "defaultFileReservationMinutes": 20,
    "validationIsolation": "strict",
    "allowedPushBranches": ["main"]
  },
  "context": {
    "paperclipProtocolTokens": 700,
    "projectBriefTokens": 800,
    "projectMemoryTokens": 1500,
    "taskDescriptionTokens": 4000,
    "eventDeltaTokens": 1500,
    "recentCommentsTokens": 1000,
    "continuationSummaryTokens": 1000,
    "skillManifestTokens": 400
  },
  "routines": {
    "concurrencyPolicy": "skip_if_active",
    "catchUpPolicy": "skip_missed"
  },
  "models": {
    "fallbackEnabled": true,
    "fallbackMode": "equivalent_capabilities"
  },
  "governance": {
    "requireHumanApprovalForAgentCreation": true,
    "requireHumanApprovalForOrgChanges": true,
    "requireHumanApprovalForSecretGrants": true,
    "requireHumanApprovalForExternalSideEffects": true
  },
  "retention": {
    "runLogsDays": 30,
    "providerTranscriptsDays": 30,
    "taskRecords": "until_manual_cleanup",
    "taskOutputs": "until_manual_cleanup"
  }
}
```

## 39. Open Decisions

The following decisions may be finalized during implementation without changing the core architecture:

1. Whether the short CLI binary is named `pc` or exposed as a `paperclipai` subcommand.
2. Whether Light status names are stored directly or mapped onto current issue statuses.
3. Whether project-memory writes require manager review by default.
4. Exact weighted-fair-queue scheduling algorithm.
5. Whether agent-generated skill changes require approval independently from agent creation and secret grants.
6. Whether task-tree token budgets stop only new child work or the entire tree.
7. Which open-source runtimes can report cached tokens and compute utilization reliably.
8. Whether the semantic Light API remains a dedicated namespace or becomes the default v2 task API.

## 40. Product Boundary Summary

Paperclip Light consists of:

```text
Companies
Projects
Agents and org charts
Skills
Company and project secrets
Explicit agent secret grants
Tasks and subtasks
Agent reviews
Routines that create tasks
Human actions
Provider-neutral runs
Compact project memory
Logs, costs, and budgets
```

The normal Light path excludes:

```text
Periodic LLM heartbeats
Implicit comment wakes
Unbounded session reuse
Full-history prompt reconstruction
Mandatory large operational skills
Recursive LLM recovery
Automatic status-repair turns
Unbounded review or mention loops
```

The defining experience is simple: create an autonomous organization, assign work, let agents delegate and review it, intervene only for sensitive decisions, and understand exactly what every result cost.

## 41. Shared Repository Workspace and File Reservations

### 41.1 Selected workspace model

Each source-controlled project is linked to one primary Git repository and uses one Paperclip-managed shared checkout. Paperclip Light does not create one worktree or one branch per task in this mode.

This deliberately trades maximum write parallelism for a simpler delivery model:

- Agents may read the same repository concurrently.
- Agents may edit different reserved files concurrently.
- Two agents may never hold write authority over the same path at the same time.
- Git metadata operations are serialized by the harness.
- Final validation and delivery are performed against a stable repository state.

The project MAY support other workspace modes in the future, but `shared_checkout_with_file_reservations` is the default described by this specification.

### 41.2 Project repository configuration

A project repository configuration SHOULD include:

```ts
interface ProjectRepositoryPolicy {
  repositoryUrl: string;
  checkoutPath: string;
  remoteName: string;
  activeBranch: string;
  allowedPushBranches: string[];
  allowedMergeTargets: string[];
  allowAgentCommit: boolean;
  allowAgentPush: boolean;
  allowAgentMerge: boolean;
  pushApproval: "standing_project_policy" | "per_push_human";
  mergeApproval: "standing_project_policy" | "per_merge_human";
  productionBranches: string[];
  productionPushApproval: "per_push_human" | "standing_project_policy";
  validationIsolation: "strict" | "shared";
  validationCommands: string[];
  ephemeralWriteRoots: string[];
}
```

The operator chooses the active working branch and may multi-select branches that agents are allowed to push to. An allowed push branch is permission, not an instruction to switch the shared checkout.

### 41.3 One active local branch

A shared checkout can have only one checked-out branch at a time. Therefore:

- `activeBranch` is the one local working branch for the project.
- Agents MUST NOT run `git checkout`, `git switch`, or an equivalent direct branch-changing command.
- A branch change is a project maintenance operation that pauses new repository work, checkpoints active changes, acquires the repository lock, switches, validates, and resumes eligible tasks.
- An agent may push `HEAD` to an allowed destination branch without switching the checkout, subject to the push policy.
- Supporting multiple simultaneously checked-out branches requires another workspace mode and is outside the shared-checkout design.

The UI MUST explain this distinction so multi-selecting allowed push branches is not mistaken for local branch concurrency.

### 41.4 Reservation granularity

A reservation may target:

- One existing file.
- One intended new-file path.
- A source and destination path for rename or move.
- A narrowly scoped directory prefix when a task must create an unknown set of new files.

Directory reservations SHOULD be exceptional because they reduce parallelism. Repository-root reservations require a repository maintenance permission.

Path rules:

- Paths are normalized relative to the project repository root.
- Absolute paths, `..`, symlink escapes, and case-folding aliases fail closed.
- On case-insensitive filesystems, path comparison uses the filesystem's canonical case rules.
- Reserving a directory conflicts with every file or nested directory reservation under that prefix.
- Renaming or deleting a file requires a reservation for every affected path.

### 41.5 Read and write behavior

All tracked repository files are read-only to an agent process unless that run owns the corresponding reservation. New files may be created only under an explicitly reserved path or prefix.

Ignored build caches and temporary outputs may be written under project-configured `ephemeralWriteRoots`, for example `.cache/`, `tmp/`, or an external package cache. If an ignored or generated file is itself a required deliverable, it must be reserved or published as an artifact.

The strict guarantee cannot rely only on agent cooperation. The harness MUST enforce it through one of these mechanisms:

- A per-run filesystem namespace that mounts unreserved paths read-only and reserved paths writable.
- A sandbox filesystem broker that authorizes every write.
- An equivalent OS-level containment mechanism.

Adapters that cannot provide strict enforcement MAY run only when the project explicitly enables an advisory compatibility mode. Advisory mode detects unauthorized changes and fails the run, but it MUST be visibly marked as weaker and MUST NOT be the default.

### 41.6 Reservation workflow

The normal workflow is:

1. The agent reads and investigates freely.
2. Before its first write, it requests the complete anticipated write set.
3. Paperclip acquires the requested set atomically.
4. The harness exposes only those paths as writable.
5. The agent edits and runs appropriate checks.
6. The commit broker commits only paths owned by the task.
7. The delivery broker pushes or requests approval according to project policy.
8. Paperclip releases the reservations.

Agents SHOULD reserve the anticipated set in one request. They MAY expand it later, but expansion remains atomic and subject to deadlock prevention.

### 41.7 Waiting for a file

If any requested path is unavailable:

- No partial reservation is granted for that request.
- The task transitions to `paused` with reason `file_reserved`.
- The task records the blocking paths and owning tasks without exposing unrelated content.
- No model run remains active merely to wait.
- The reservation queue is deterministic and normally FIFO.
- When the complete requested set becomes available, Paperclip emits one `file_reservation.available` event.
- The task returns to `todo` and may resume under normal concurrency limits.

This is a temporary resource wait, not a logical blocker and not a technical failure.

### 41.8 Deadlock prevention

Multi-file reservations are acquired as one database transaction. A task never waits after receiving only part of a requested set.

For reservation expansion, Paperclip maintains a waits-for graph. If an expansion would create a cycle:

- The youngest conflicting expansion loses deterministically.
- Its active run checkpoints safely.
- Its held reservations are released after checkpointing.
- Its task moves to `paused` and waits for the full union of required paths.

This prevents the classic cycle where task A owns file 1 and wants file 2 while task B owns file 2 and wants file 1.

### 41.9 Reservation leases

Reservations are durable database records owned by a task and current run. The harness renews the lease deterministically while the process is alive; no LLM heartbeat is involved.

A reservation MUST NOT become writable by another task immediately after an unexplained lease expiry if the shared checkout still contains uncommitted changes. Instead it becomes `orphaned` and follows this flow:

1. Stop or confirm loss of the owning process.
2. Snapshot the owned diff as a private task checkpoint.
3. Attempt the configured technical retry.
4. Reattach reservations to the retry when safe.
5. After retry exhaustion, release or discard only through a human action that explains the files and saved checkpoint.

This prevents a crashed agent's partial edit from becoming another agent's invisible starting point.

The deterministic maintenance sweep MAY reclaim an expired orphan without human intervention when persisted state proves that the owner completed successfully, or when the task already entered `in_review` or a terminal lifecycle state whose transition captured any owned diff. A failed, interrupted, missing, or otherwise ambiguous non-terminal owner remains orphaned for checkpoint recovery or human force release. Reclaiming a safe orphan immediately runs FIFO waiter promotion; promotion skips tasks that still have unresolved first-class dependencies, and emits at most one resume wake for the promoted reservation request.

### 41.10 Shared Git metadata

File reservations protect working-tree paths, but Git also has shared mutable metadata: the index, `HEAD`, refs, merge state, and lock files. All mutating Git operations MUST therefore go through a repository broker guarded by a short exclusive repository-operation lock.

Agents MUST NOT directly execute:

- `git add`
- `git commit`
- `git pull`
- `git merge`
- `git rebase`
- `git checkout` or `git switch`
- `git reset`
- `git push`

Read-only Git commands such as `git status`, `git diff`, `git log`, and `git show` remain available when they do not mutate shared state.

### 41.11 Commit broker

The commit broker:

- Verifies the task owns every requested path.
- Rejects unreserved changed paths in the commit request.
- Acquires the repository-operation lock.
- Stages explicit paths only; it never uses `git add -A`.
- Creates an attributable commit with task, agent, and run metadata.
- Records the resulting commit SHA as a task output.
- Leaves other tasks' uncommitted paths unstaged.
- Releases the repository-operation lock.

The broker MUST prevent one task from accidentally committing another task's files even when both edits exist in the shared working tree.

### 41.12 Read isolation tradeoff and validation barrier

File reservations prevent crossed writes, but a single shared checkout does not provide read isolation: one agent may see another agent's uncommitted changes in a different file.

Paperclip MUST surface this tradeoff and provide a final validation barrier:

- In `strict` validation mode, task finalization waits until other active editors have committed or safely checkpointed their changes.
- The harness freezes new writes, verifies the required repository state, runs configured validation commands, then allows commit and delivery.
- In `shared` validation mode, scoped checks may run alongside unrelated edits, but the run record states that the result was obtained from a mixed working tree.
- Production delivery SHOULD require strict validation.

This barrier makes the no-worktree model correct at the cost of some serialization, matching the intentional product tradeoff.

### 41.13 Remote changes and synchronization

The repository broker fetches the configured remote before delivery.

- Fast-forward updates may be applied automatically only when the shared checkout can be synchronized safely.
- If the remote moved while tasks hold dirty reservations, new delivery pauses with reason `repository_sync_required`.
- Active task diffs are checkpointed, the checkout is synchronized under the repository lock, and checkpoints are reapplied only when their base hashes still match.
- Conflicts become a named task blocker or human action; Paperclip MUST NOT run an automatic merge-recovery loop.
- Force push is denied by default and requires an explicit project policy plus per-action human approval.

### 41.14 Push, merge, and production policy

Repository permissions are configured independently:

- `commit`: create a local commit through the broker.
- `push`: update an allowlisted remote branch.
- `merge`: merge an allowlisted source into an allowlisted target.
- `deploy`: invoke the project's deployment action.

The operator may configure standing project authorization for routine commits and pushes to selected branches. Production branches are separately identified. A project may require a human action before every production push, merge, or deployment.

No agent may push or merge outside the allowlists. A branch allowlist does not grant force push, branch deletion, tag mutation, or deployment authority.

### 41.15 File reservation CLI

Suggested semantic commands:

```sh
pc files reserve COM-1 src/auth.ts src/login.tsx
pc files reserve COM-1 "src/generated/"
pc files status COM-1
pc files release COM-1

pc repo diff COM-1
pc repo validate COM-1
pc repo commit COM-1 -m "Add passwordless login"
pc repo push COM-1 --branch main
```

`pc repo commit` and `pc repo push` are broker requests, not thin wrappers around unrestricted Git commands.

### 41.16 Persistence

Suggested records:

```text
project_repositories
- id, company_id, project_id, repository_url, checkout_path
- active_branch, policy, status, last_synced_sha

file_reservations
- id, company_id, project_id, repository_id
- task_id, run_id, normalized_path, path_kind
- status: active | waiting | orphaned | released
- acquired_at, lease_expires_at, released_at

repository_operations
- id, company_id, project_id, repository_id
- task_id, run_id, kind
- requested_paths, source_ref, target_ref
- approval_id, status, result_sha, error_code
- created_at, started_at, completed_at

task_checkpoints
- id, company_id, project_id, task_id, run_id
- base_sha, patch_asset_id, path_hashes, reason
- created_at, restored_at, discarded_at
```

## 42. Pause, Cancellation, Interruption, Blocking, and Failure

### 42.1 Pause

`paused` represents a temporary wait with a mechanically detectable resume condition. Examples:

- A required file is reserved by another task.
- A provider quota has a known reset time.
- The operator paused execution temporarily.
- Host capacity is intentionally unavailable.

While paused:

- No model run remains open merely to wait.
- The resume condition is stored structurally.
- Paperclip may run deterministic checks.
- Exactly one resume event is emitted when the condition becomes true.

### 42.2 Manual pause checkpoint

Pausing an actively editing task follows a safe checkpoint protocol:

1. Stop new tool actions.
2. Ask the runtime to terminate gracefully within a short bounded grace period.
3. Snapshot diffs for files owned by the task.
4. Store a private patch artifact with base hashes.
5. Restore only those owned paths to their committed state.
6. Release file reservations and runtime capacity.
7. Mark the task `paused`.

On resume, Paperclip reacquires the complete write set and reapplies the checkpoint only when base hashes remain compatible. Otherwise it records `checkpoint_conflict` and creates a clear action for the manager or human.

### 42.3 Cancellation

`cancelled` means a human intentionally stopped the task. Cancellation:

- Cancels queued execution events.
- Stops active provider processes.
- Prevents automatic retry and resume.
- Snapshots current owned changes for audit or optional recovery.
- Releases file and repository locks safely.
- Preserves completed outputs and cost history.
- Writes an immutable cancellation activity record.

For a parent task, the human chooses:

- `cancel_subtree`: cancel non-terminal descendants created for the parent.
- `detach_children`: preserve selected children as independent tasks.

The UI defaults to `cancel_subtree` and previews affected tasks before confirmation.

### 42.4 Blocked

`blocked` means the next useful action belongs to a logical dependency, subtask, missing decision, missing information, or unresolved problem. A blocked record includes:

- Machine-readable reason.
- Human-readable explanation.
- Owner of the next action.
- Required action.
- Related dependency, subtask, or human-action IDs.
- Resume rule.

Completed dependencies emit a deterministic resumption event. Paperclip does not poll with a model.

### 42.5 Failed

`failed` means the configured technical attempts are exhausted. Paperclip creates a Human Action Center card in precise English containing:

- What failed.
- Provider or runtime.
- Exact classified reason.
- Attempts already made.
- Whether fallback was attempted.
- Whether work was checkpointed.
- Recommended buttons such as `Retry`, `Use fallback`, `Reassign`, or `Cancel`.

No further model call occurs until a human chooses an action.

### 42.6 Interruption precedence

Interruption order is:

```text
human cancel
> security revocation
> budget hard stop
> manual pause
> repository/file wait
> technical retry
```

A higher-precedence interruption cancels or supersedes pending lower-precedence events so the same task cannot simultaneously retry and cancel.

## 43. Dependencies and Task-Tree Explosion Control

### 43.1 Dependency model

Tasks may declare `depends_on` edges to tasks in the same company. Cross-project dependencies are allowed only when both projects are visible to the actor and policy permits them.

A dependency may be:

- `required_success`: dependency must reach `done`.
- `required_terminal`: dependency may reach any terminal state, and the dependent task receives the outcome.
- `informational`: dependency is shown but does not block execution.

Dependency cycles are rejected transactionally.

### 43.2 Dependency waiting

A task with unresolved required dependencies is `blocked`, not `paused`, because useful progress depends on another work item. When all required dependencies satisfy their conditions, Paperclip emits one `task.dependencies_resolved` event and returns the task to `todo`.

If a required-success dependency is cancelled or failed, the dependent task remains blocked and names the manager or human action required to continue, replace, or waive the dependency.

### 43.3 Default task-tree limits

Recommended defaults:

- Maximum depth: 3 levels below a root task.
- Maximum direct children: 12 per task.
- Maximum total tasks: 50 per task tree.
- Maximum simultaneously running descendants: 8, also bounded by lower host/company/project limits.
- Maximum cross-agent mentions: 5 per task tree.
- Maximum review cycles: 3 per task.

Limits are configurable but every company MUST have finite values.

### 43.4 Creation budget

Before creating a child, Paperclip evaluates:

- Remaining tree depth.
- Direct-child count.
- Total tree count.
- Remaining token and monetary budget.
- Expected assignee availability.
- Duplicate-task similarity.
- Current concurrency.

When a limit is reached, the agent receives a deterministic denial and must consolidate work, finish existing children, or ask its manager to raise the limit. The denial does not create another model run.

### 43.5 Duplicate detection

Paperclip computes a normalized fingerprint from project, parent, title, requested output, and target agent. Exact duplicates are rejected. High-similarity candidates produce a compact warning with existing task IDs and require the creating agent to reuse one or provide a distinct reason.

### 43.6 Parent completion

A parent cannot reach `done` while a required child or required dependency is non-terminal. Optional children may be detached or cancelled through an explicit disposition. Cost rollups preserve detached-child history up to detachment and avoid double counting afterward.

## 44. Exactly-Once External Actions

### 44.1 Scope

External side effects include:

- Sending email or messages.
- Making payments or purchases.
- Publishing content or advertising campaigns.
- Creating external accounts.
- Deleting remote resources.
- Deploying to production.
- Mutating production data.
- Any provider operation that cannot be safely repeated.

### 44.2 Human approval

Every sensitive or irreversible external action requires a human decision unless a narrowly defined project policy explicitly treats the operation as a standing-safe action. Payments, irreversible deletion, and outbound human communication require per-occurrence approval and cannot use standing approval.

Model output is a proposal. It is never evidence that an external action executed.

### 44.3 State machine

```text
draft
  → awaiting_approval
  → approved
  → executing
  → succeeded | failed_unknown | failed_safe
```

- `failed_safe`: provider confirms that no side effect occurred; a new approved attempt may be created.
- `failed_unknown`: Paperclip cannot prove whether the side effect occurred; automatic retry is forbidden and a human reconciliation action is required.

### 44.4 Idempotency and receipts

Every action has an immutable idempotency key generated before approval. Provider adapters MUST pass that key when the provider supports idempotency.

On success, Paperclip stores a sanitized receipt containing provider, external object ID, timestamp, result fingerprint, and safe links. It never stores a secret value or full sensitive payload in logs.

### 44.5 No automatic retry

External side effects never use the ordinary technical retry policy. A transport error causes one of two outcomes:

- The provider can prove no effect occurred: create a new explicit attempt under the original approval scope when policy allows.
- The outcome is unknown: stop and ask a human to reconcile.

This prevents duplicate emails, payments, publications, or deployments.

## 45. Deterministic Agent Health and Provider Quotas

### 45.1 Health checks

Paperclip runs free deterministic checks on a configurable schedule. Checks may verify:

- Runtime executable availability and version.
- Provider authentication validity without exposing credentials.
- Configured model availability.
- Network reachability.
- Provider quota and rate-limit state.
- Required secret resolution.
- Repository and checkout health.
- Writable storage capacity.
- Host CPU, memory, and GPU capacity.
- Adapter diagnostic conformance.

Health checks MUST NOT invoke a generative model.

### 45.2 Health states

```text
healthy
degraded
unavailable
quota_wait
authentication_required
configuration_error
unknown
```

Each state includes a stable reason code, concise English explanation, last check time, next planned check, and recommended remediation.

### 45.3 Quota reasons

Quota and provider failures SHOULD distinguish:

- `rate_limited_until`
- `daily_quota_exhausted`
- `monthly_quota_exhausted`
- `credit_balance_exhausted`
- `authentication_expired`
- `model_unavailable`
- `model_removed`
- `context_limit_exceeded`
- `provider_outage`
- `network_unreachable`

When a trustworthy reset time exists, the task becomes `paused` until that time and no paid retry occurs. Without a reset time, fallback policy is evaluated; if none applies, the task becomes `blocked` or `failed` with the exact reason.

### 45.4 Health scheduling

The operator configures the deterministic health interval. Checks use backoff, jitter, and provider-wide coalescing so dozens of agents sharing one provider do not perform identical probes independently.

## 46. Run Identity and Configuration Precedence

### 46.1 Short-lived run credential

Every run receives a short-lived credential bound to:

- Company.
- Project.
- Agent.
- Task.
- Run.
- Allowed Paperclip actions.
- Allowed secret binding references.
- Expiration.
- Optional workspace and network policy hashes.

The credential expires when the run finishes or is revoked. Permanent agent API keys SHOULD NOT be exposed to ordinary model processes.

### 46.2 Configuration precedence

Configuration resolves in this order:

```text
Instance defaults
→ Company policy
→ Project policy
→ Agent configuration
→ Task override
→ Run safety constraints
```

Later layers may specialize ordinary values but cannot weaken a hard constraint from an earlier layer.

Examples:

- A project may lower an agent's concurrency but cannot exceed the host limit.
- A task may request a different model only if agent and project policies allow it.
- An agent may use a narrower secret set but cannot add an ungranted secret.
- A run constraint may remove network access after a security event.

### 46.3 Merge semantics

Every setting declares one merge strategy:

- `override`: most specific allowed value wins.
- `minimum`: lowest numeric limit wins.
- `intersection`: only values allowed by every layer survive.
- `append_bounded`: later values append within a fixed cap.
- `hard_deny_wins`: any deny is final.

The effective configuration and source of every value are stored on the run for audit and reproducibility.

## 47. Outputs, Artifacts, and Storage

### 47.1 Output classes

A task may produce:

- Text summary.
- Workspace file.
- Uploaded file.
- Commit.
- Remote branch update.
- Pull request.
- Preview URL.
- Deployment URL.
- Image, audio, or video.
- Dataset or archive.
- Report or document.
- Campaign, publication, message, or external record receipt.

### 47.2 Artifact contract

Every durable artifact records:

- Company, project, task, and creating run.
- Kind and media type.
- Filename and byte size.
- Content hash.
- Storage provider and object reference.
- Preview and download behavior.
- Visibility and retention class.
- Provenance and optional external URL.
- Verification status.

Before a task reaches `done`, every referenced required output MUST resolve successfully or be explicitly marked as an external receipt.

### 47.3 Storage classes

- `ephemeral`: build scratch and temporary data; removed automatically.
- `run_log`: detailed execution data; retained 30 days by default.
- `task_output`: user-inspectable deliverable; retained until manual cleanup.
- `checkpoint`: private resumable task state; retained until task completion plus a bounded recovery window.
- `audit_receipt`: compact security or external-action evidence; retained according to audit policy.

### 47.4 Local and remote storage

On a VPS or local machine, Paperclip may use local disk storage. S3-compatible storage remains available for larger or shared deployments. Database rows store metadata and references rather than large file bodies.

Storage quotas are configurable by company and project. A storage hard limit blocks new large artifacts with a clear action instead of silently deleting task outputs.

## 48. Review Fallbacks and Notifications

### 48.1 Reviewer resolution order

When a primary reviewer is unavailable, Paperclip resolves:

1. Explicit task reviewer.
2. Agent's direct manager.
3. Project-configured fallback reviewer.
4. Manager's manager.
5. Authorized reviewer pool.
6. Human Action Center.

Each candidate must be active, authorized, capable, within budget, and able to read the project. The chosen fallback is recorded. Paperclip emits at most one `task.review_rerouted` event per reviewer candidate.

### 48.2 Notification principles

Notifications are concise English action requests. They state what happened, what the human must do, and the consequence of doing nothing. Humans should not need to interpret raw logs.

Example:

```text
Title: Action required: coding agent unavailable
Task: COM-42 — Implement passwordless login
Reason: OpenCode authentication expired after 2 retries.
Saved work: 3 files checkpointed; no commit was pushed.
Choose: Re-authenticate and retry, use fallback model, reassign, or cancel.
```

### 48.3 Notification triggers

Recommended triggers:

- Human action requested.
- Task failed after retries.
- Budget hard stop.
- Secret expired or revoked.
- Routine occurrence conflict.
- Reviewer fallback exhausted.
- Production action awaiting approval.
- Abnormal token or storage spike.

Notifications are deduplicated by source and state version. Multiple related events SHOULD be grouped into one digest when no immediate action is required.

## 49. Retention, Export, Cleanup, and Deletion

### 49.1 Default retention

| Data | Default retention |
| --- | --- |
| Detailed run logs | 30 days |
| Provider transcripts | 30 days |
| Temporary runtime files | Until run cleanup |
| Task checkpoints | Until completion plus recovery window |
| Completed tasks and comments | Until manual cleanup |
| Task outputs | Until manual cleanup |
| Cost aggregates | Indefinite unless company deletion policy says otherwise |
| Config and instruction versions | Indefinite unless compacted by explicit policy |
| Security and secret access audit | Policy-defined, never shorter than ordinary logs by default |

The daily retention job is deterministic and invokes no model.

### 49.2 Log deletion

After 30 days, Paperclip removes detailed logs and transcripts while preserving:

- Run identity and outcome.
- Start and finish times.
- Model and provider.
- Token and cost totals.
- Failure classification.
- Final task summary.
- Context component sizes and hashes.
- Security and external-action receipts required by policy.

### 49.3 Manual cleanup

Operators can preview and clean:

- Completed tasks.
- Old artifacts.
- Checkpoints.
- Project memory.
- Historical configuration versions subject to retention constraints.

Cleanup previews exact objects, sizes, references, and recoverability. Material deletion requires confirmation and writes an audit record.

### 49.4 Export

A company or project export SHOULD include:

- Agents and org chart.
- Projects and repository policy without credentials.
- Instructions and version history.
- Skills and assignments.
- Routines and revisions.
- Tasks, comments, summaries, dependencies, and review outcomes.
- Project memory.
- Artifact metadata and optionally file bodies.
- Cost aggregates.
- Secret declarations and grants without values.

### 49.5 Company deletion

Company deletion is a distinct destructive workflow. It requires an authorized human, a preview, a grace period where deployment mode permits it, revocation of run credentials, cancellation of active work, and provider-aware cleanup. Backups and externally pushed Git history are outside database deletion and must be explained clearly.

## 50. Versioning and Reproducibility

### 50.1 Versioned resources

Paperclip maintains immutable revisions for:

- Agent role instructions.
- Agent adapter and model configuration.
- Company and project policy.
- Project brief.
- Project memory snapshots.
- Skill content and assignments.
- Team templates after installation.
- Routines.
- Secret metadata, grants, and encrypted secret versions.
- Human action policy.
- Repository policy.

### 50.2 Run snapshot

Every run stores exact revision IDs and content hashes for:

- Effective agent instructions.
- Project brief.
- Selected project memory.
- Selected skills.
- Task version.
- Model profile and routing decision.
- Adapter version.
- Effective policy.
- Secret grant metadata.
- Repository commit and working branch.

Secret values are never copied into the snapshot.

### 50.3 Rollback

An authorized operator can compare revisions and restore a previous revision by creating a new latest revision. Historical rows remain immutable. Restoring configuration does not retroactively change completed runs.

### 50.4 Repository-owned project policy

Project-specific marketing, development, brand, legal, or operational instructions may live in version-controlled project documents such as:

```text
PROJECT.md
MARKETING.md
BRAND.md
SECURITY.md
```

The project configuration declares which files are authoritative. Runs record the Git commit and file hashes used. Editing these files requires normal file reservations and review.

## 51. Quality Evaluation and Model Effectiveness

### 51.1 Outcome metrics

Paperclip SHOULD measure:

- First-review acceptance rate.
- Review cycles per task.
- Tests and validations passed.
- Reopened-task rate.
- Retry and fallback rate.
- Failed-task rate.
- Human intervention rate.
- Time to accepted result.
- Tokens and cost per accepted task.
- Tokens by context component.
- Artifact and output verification success.

### 51.2 Quality, not only cost

Model routing MUST optimize for accepted outcomes, not the lowest token price alone. A cheap model that repeatedly fails review may be more expensive than a stronger model that completes once.

Suggested effectiveness measure:

```text
accepted outcome value
÷ (normalized cost + retry penalty + review penalty + latency penalty)
```

The exact formula is configurable and SHOULD remain explainable.

### 51.3 Evaluation data

Evaluation records reference tasks, models, agents, reviews, tests, and costs. They MUST obey task visibility, log retention, deletion, and privacy rules. Raw private content is not exported for training without an explicit separate policy.

## 52. Project Policy Documents and Marketing Constraints

Marketing constraints live at project scope in repository or project documents rather than being copied into every permanent agent instruction.

Typical content includes:

- Brand voice.
- Approved positioning.
- Prohibited claims.
- Required legal disclaimers.
- Target audiences.
- Image and media-rights rules.
- Personal-data restrictions.
- Allowed channels and accounts.
- Advertising spend limits.
- Draft, review, and publication policy.

The context builder selects the relevant bounded sections for a task. Full documents remain retrievable through tools. External publication still follows the exactly-once human-action flow.

## 53. Routine Time and Calendar Settings

Routine scheduling uses a project or company timezone selected in settings. Standard timezone behavior includes:

- IANA timezone identifiers.
- Daylight-saving transitions handled by the scheduler library.
- Explicit missed-occurrence policy.
- Idempotent occurrence keys.
- Manual trigger support.
- Optional exclusion dates.

Timezone calculations are deterministic and never involve a model.

## 54. Multiple Human Users

### 54.1 Human roles

Recommended roles:

- `instance_admin`: manages deployment-wide configuration and all companies.
- `company_owner`: full authority inside one company.
- `company_admin`: manages agents, projects, policies, and members within granted scope.
- `operator`: manages tasks and ordinary execution.
- `approver`: resolves specified Human Action Center action classes.
- `auditor`: reads tasks, costs, and audit records without mutation authority.
- `viewer`: read-only access to allowed ordinary company surfaces.

### 54.2 Scoped approvers

Approval authority may be scoped by:

- Company.
- Project.
- Action class.
- Monetary amount.
- Production environment.
- Secret or provider category.

An approver for marketing publication does not automatically become a finance or secret administrator.

### 54.3 Decision concurrency

Human actions use exact-once decision semantics. The first authorized terminal decision wins under a row lock. Later attempts receive the existing result and cannot execute the side effect again.

### 54.4 Attribution

Every human mutation records user identity, role and scope used for authorization, source IP or session metadata where policy permits, affected company/project/task, and decision outcome.

## 55. Additional Acceptance Criteria

Paperclip Light is not implementation-ready until these conditions are testable:

1. Two agents editing different files can work concurrently in one shared checkout.
2. Two agents can never write the same reserved file concurrently under strict mode.
3. An agent cannot bypass reservations through shell commands, symlinks, renames, or path case aliases.
4. Concurrent commits cannot mix files owned by different tasks.
5. Final strict validation never claims a clean isolated result from a mixed dirty working tree.
6. A crashed editor preserves its diff and does not expose the path to another writer silently.
7. A waiting file task consumes zero model tokens and resumes exactly once.
8. Manual pause checkpoints and safely releases owned paths.
9. Human cancellation prevents retries and releases resources without losing audit evidence.
10. Dependency cycles and task-tree limit violations are rejected without creating model runs.
11. Failed tasks create one concise English human action after retry exhaustion.
12. An external email, payment, publication, or production action cannot execute twice after a retry, restart, or duplicate click.
13. Agent health and quota checks consume zero generative-model tokens.
14. Every run uses a short-lived task-scoped credential and stores its effective configuration revision hashes.
15. Detailed logs disappear after 30 days while durable task summaries and costs remain correct.
16. Completed tasks and task outputs remain until an authorized manual cleanup.
17. Instruction, skill, policy, routine, and model configuration rollback creates a new revision and preserves history.
18. Reviewer fallback terminates at a human action rather than looping.
19. Multi-human approvals enforce action-specific scope and exact-once resolution.
20. Quality dashboards compare cost per accepted result rather than raw token price alone.
