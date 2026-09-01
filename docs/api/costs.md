---
title: Costs
summary: Cost events, summaries, and budget management
---

Track token usage and spending across agents, projects, and the company.

## Report Cost Event

```
POST /api/companies/{companyId}/cost-events
{
  "agentId": "{agentId}",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "inputTokens": 15000,
  "outputTokens": 3000,
  "costCents": 12
}
```

Typically reported automatically by adapters after each heartbeat.

## Company Cost Summary

```
GET /api/companies/{companyId}/costs/summary
```

Returns total spend, budget, and utilization for the current month.

## Costs by Agent

```
GET /api/companies/{companyId}/costs/by-agent
```

Returns per-agent cost breakdown for the current month.

## Costs by Project

```
GET /api/companies/{companyId}/costs/by-project
```

Returns per-project cost breakdown for the current month.

## Task Cost Summary

```
GET /api/issues/{taskId}/cost-summary
GET /api/issues/{taskId}/cost-summary?excludeRoot=true
```

The first request returns tokens, billed cost, run count, and runtime for the
task and all of its descendants. The second returns descendants only. The task
detail UI subtracts the descendants-only summary from the complete tree to show
both **This task** and **With sub-tasks** without maintaining duplicate rollup
rows.

Cached input tokens are included in the displayed token total. When metered or
unknown usage was reported without a provider price, `unpricedEventCount` is
greater than zero and the UI says **cost unavailable** rather than incorrectly
displaying a zero cost. `subscriptionIncludedEventCount` is tracked separately
and renders as **included in subscription**.

## Budget Management

### Set Company Budget

```
PATCH /api/companies/{companyId}
{ "budgetMonthlyCents": 100000 }
```

### Set Agent Budget

```
PATCH /api/agents/{agentId}
{ "budgetMonthlyCents": 5000 }
```

## Budget Enforcement

| Threshold | Effect |
|-----------|--------|
| 80% | Soft alert — agent should focus on critical tasks |
| 100% | Hard stop — agent is auto-paused |

Budget windows reset on the first of each month (UTC).
