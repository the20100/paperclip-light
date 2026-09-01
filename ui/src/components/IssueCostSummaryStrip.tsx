import { useQuery } from "@tanstack/react-query";
import type { IssueCostSummary } from "@paperclipai/shared";
import { issuesApi } from "@/api/issues";
import { useVisibilityRefetchInterval } from "@/lib/polling";
import { queryKeys } from "@/lib/queryKeys";
import { cn, formatCents, formatDurationMs, formatTokens } from "@/lib/utils";

interface IssueCostSummaryStripProps {
  issueId: string;
  hasDescendants: boolean;
  hasLiveRuns?: boolean;
  className?: string;
}

function subtractSummary(
  total: IssueCostSummary,
  descendants: IssueCostSummary | null,
): IssueCostSummary {
  if (!descendants) return total;
  return {
    ...total,
    issueCount: Math.max(1, total.issueCount - descendants.issueCount),
    includeDescendants: false,
    costCents: Math.max(0, total.costCents - descendants.costCents),
    unpricedEventCount: Math.max(0, total.unpricedEventCount - descendants.unpricedEventCount),
    subscriptionIncludedEventCount: Math.max(
      0,
      total.subscriptionIncludedEventCount - descendants.subscriptionIncludedEventCount,
    ),
    inputTokens: Math.max(0, total.inputTokens - descendants.inputTokens),
    cachedInputTokens: Math.max(0, total.cachedInputTokens - descendants.cachedInputTokens),
    outputTokens: Math.max(0, total.outputTokens - descendants.outputTokens),
    runCount: Math.max(0, total.runCount - descendants.runCount),
    runtimeMs: Math.max(0, total.runtimeMs - descendants.runtimeMs),
  };
}

function tokenTotal(summary: IssueCostSummary): number {
  return summary.inputTokens + summary.cachedInputTokens + summary.outputTokens;
}

function usageTitle(summary: IssueCostSummary): string {
  const unpriced = summary.unpricedEventCount > 0
    ? ` · ${summary.unpricedEventCount.toLocaleString()} unpriced usage event${summary.unpricedEventCount === 1 ? "" : "s"}`
    : "";
  const subscription = summary.subscriptionIncludedEventCount > 0
    ? ` · ${summary.subscriptionIncludedEventCount.toLocaleString()} subscription-included event${summary.subscriptionIncludedEventCount === 1 ? "" : "s"}`
    : "";
  return [
    `${summary.inputTokens.toLocaleString()} input tokens`,
    `${summary.cachedInputTokens.toLocaleString()} cached input tokens`,
    `${summary.outputTokens.toLocaleString()} output tokens`,
    `${formatDurationMs(summary.runtimeMs)} runtime`,
    `${summary.runCount.toLocaleString()} run${summary.runCount === 1 ? "" : "s"}${subscription}${unpriced}`,
  ].join(" · ");
}

function CostValue({ summary }: { summary: IssueCostSummary }) {
  if (
    summary.subscriptionIncludedEventCount > 0
    && summary.costCents === 0
    && summary.unpricedEventCount === 0
  ) {
    return <span>included in subscription</span>;
  }
  if (summary.unpricedEventCount > 0 && summary.costCents === 0) {
    return (
      <span>
        cost unavailable
        {summary.subscriptionIncludedEventCount > 0 ? " + subscription usage" : ""}
      </span>
    );
  }
  return (
    <span>
      {formatCents(summary.costCents)} billed
      {summary.subscriptionIncludedEventCount > 0 ? " + subscription usage" : ""}
      {summary.unpricedEventCount > 0 ? " + unpriced usage" : ""}
    </span>
  );
}

function UsageValues({ summary }: { summary: IssueCostSummary }) {
  const tokens = tokenTotal(summary);
  const hasReportedUsage = tokens > 0
    || summary.costCents > 0
    || summary.unpricedEventCount > 0
    || summary.subscriptionIncludedEventCount > 0;
  if (!hasReportedUsage) {
    return (
      <span className="font-mono" title={usageTitle(summary)}>
        {summary.runCount > 0
          ? `${summary.runCount.toLocaleString()} run${summary.runCount === 1 ? "" : "s"} · no usage reported`
          : "no usage reported"}
      </span>
    );
  }
  return (
    <span className="font-mono" title={usageTitle(summary)}>
      {formatTokens(tokens)} tokens · <CostValue summary={summary} />
      {summary.runCount > 0
        ? ` · ${summary.runCount.toLocaleString()} run${summary.runCount === 1 ? "" : "s"}`
        : ""}
    </span>
  );
}

/**
 * Compact task-level usage readout. The total query includes the complete
 * subtree; a descendants-only query lets us derive the root task's direct
 * usage without storing a second rollup.
 */
export function IssueCostSummaryStrip({
  issueId,
  hasDescendants,
  hasLiveRuns = false,
  className,
}: IssueCostSummaryStripProps) {
  const liveRefetchInterval = useVisibilityRefetchInterval({ visibleMs: 5_000 });
  const refetchInterval = hasLiveRuns ? liveRefetchInterval : false;
  const { data: total } = useQuery({
    queryKey: queryKeys.issues.costSummary(issueId),
    queryFn: () => issuesApi.getCostSummary(issueId),
    refetchInterval,
  });
  const { data: descendants } = useQuery({
    queryKey: queryKeys.issues.costSummary(issueId, { excludeRoot: true }),
    queryFn: () => issuesApi.getCostSummary(issueId, { excludeRoot: true }),
    enabled: hasDescendants,
    refetchInterval,
  });

  if (!total || (hasDescendants && !descendants)) return null;

  const descendantsSummary = descendants ?? null;
  const direct = subtractSummary(total, descendantsSummary);
  const showSubtreeTotal = Boolean(descendantsSummary && descendantsSummary.issueCount > 0);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums",
        className,
      )}
      data-testid="issue-cost-summary"
      aria-label="Task token usage and billed cost"
    >
      <span className="font-medium text-foreground">Usage</span>
      {showSubtreeTotal ? (
        <>
          <span>
            This task <UsageValues summary={direct} />
          </span>
          <span>
            With sub-tasks <UsageValues summary={total} />
          </span>
        </>
      ) : (
        <UsageValues summary={direct} />
      )}
    </div>
  );
}
