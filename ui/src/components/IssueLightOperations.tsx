import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, FileLock2, GitPullRequest, History, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "../context/CompanyContext";
import { lightExecutionApi } from "../api/lightExecution";
import { formatTokens } from "../lib/utils";

export function IssueLightOperations({
  issueId,
  projectId,
  companyId,
}: {
  issueId: string;
  projectId: string | null;
  companyId: string;
}) {
  const { selectedCompany } = useCompany();
  const enabled = selectedCompany?.executionProfile === "light";
  const reviews = useQuery({
    queryKey: ["light", "reviews", issueId],
    queryFn: () => lightExecutionApi.reviews(issueId),
    enabled,
  });
  const events = useQuery({
    queryKey: ["light", "events", companyId, issueId],
    queryFn: () => lightExecutionApi.executionEvents(companyId, issueId),
    enabled,
  });
  const checkpoints = useQuery({
    queryKey: ["light", "checkpoints", projectId, issueId],
    queryFn: () => lightExecutionApi.checkpoints(projectId!, issueId),
    enabled: enabled && Boolean(projectId),
  });
  const reservations = useQuery({
    queryKey: ["light", "reservations", projectId, issueId],
    queryFn: () => lightExecutionApi.fileReservations(projectId!, issueId),
    enabled: enabled && Boolean(projectId),
  });
  const latestRunId = events.data?.find((event) => event.runId)?.runId ?? null;
  const context = useQuery({
    queryKey: ["light", "context", latestRunId],
    queryFn: () => lightExecutionApi.runContext(latestRunId!),
    enabled: enabled && Boolean(latestRunId),
  });

  if (!enabled) return null;
  const estimatedTokens = (context.data ?? []).filter((item) => item.included)
    .reduce((sum, item) => sum + item.estimatedTokens, 0);
  const duplicates = (context.data ?? []).filter((item) =>
    !item.included && item.exclusionReason?.startsWith("duplicate"),
  ).length;
  const budgetExcluded = (context.data ?? []).filter((item) =>
    !item.included && item.exclusionReason === "context_budget",
  ).length;
  const activeReservations = (reservations.data ?? []).filter((item) => item.status === "active").length;
  const availableCheckpoints = (checkpoints.data ?? []).filter((item) => item.status === "available").length;
  const latestReview = reviews.data?.[0] ?? null;

  return (
    <details className="group rounded-lg border border-border bg-muted/20 text-xs">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-muted-foreground">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        <span className="font-medium text-foreground">Light execution</span>
        <span>{events.data?.length ?? 0} events</span>
        {latestReview ? <Badge variant="outline" className="capitalize">review {latestReview.status.replaceAll("_", " ")}</Badge> : null}
        {activeReservations > 0 ? <span>{activeReservations} locked files</span> : null}
        {availableCheckpoints > 0 ? <span>{availableCheckpoints} checkpoints</span> : null}
        {context.data ? <span>{formatTokens(estimatedTokens)} estimated context tokens</span> : null}
      </summary>
      <div className="grid gap-3 border-t border-border px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-1.5 font-medium text-foreground"><History className="h-3.5 w-3.5" /> Event ledger</div>
          <p className="mt-1 text-muted-foreground">{events.data?.[0] ? `${events.data[0].kind} · ${events.data[0].status}` : "No execution event yet"}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 font-medium text-foreground"><GitPullRequest className="h-3.5 w-3.5" /> Review</div>
          <p className="mt-1 text-muted-foreground">{latestReview ? `Cycle ${latestReview.revision} · ${latestReview.status.replaceAll("_", " ")}` : "Not submitted"}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 font-medium text-foreground"><FileLock2 className="h-3.5 w-3.5" /> Shared files</div>
          <p className="mt-1 text-muted-foreground">{projectId ? `${activeReservations} active · ${availableCheckpoints} recoverable` : "No repository project"}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 font-medium text-foreground"><RotateCcw className="h-3.5 w-3.5" /> Context</div>
          <p className="mt-1 text-muted-foreground">{context.data ? `${formatTokens(estimatedTokens)} sent · ${duplicates} deduplicated · ${budgetExcluded} budget-skipped` : "Waiting for first run"}</p>
        </div>
      </div>
      {(reviews.isError || events.isError || checkpoints.isError || reservations.isError || context.isError) ? (
        <div className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-destructive">
          <CheckCircle2 className="h-3.5 w-3.5" /> Some operational data is unavailable. Reload after migrations finish.
        </div>
      ) : null}
    </details>
  );
}
