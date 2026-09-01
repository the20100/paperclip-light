import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, ExternalLink, MessageSquare, RotateCcw, ShieldCheck, UserRound, X } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { lightExecutionApi } from "../api/lightExecution";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";

const actionCenterKey = (companyId: string) => ["light", "action-center", companyId] as const;

export function LightActions() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setBreadcrumbs([{ label: "Action Center" }]), [setBreadcrumbs]);

  const query = useQuery({
    queryKey: actionCenterKey(selectedCompanyId ?? "none"),
    queryFn: () => lightExecutionApi.actionCenter(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && selectedCompany?.executionProfile === "light"),
    refetchInterval: 15_000,
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      lightExecutionApi.decideAction(selectedCompanyId!, id, decision),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: actionCenterKey(selectedCompanyId!) });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Action failed"),
  });

  const decideReview = useMutation({
    mutationFn: ({ issueId, reviewId, decision, summary, requiredChanges = [] }: {
      issueId: string;
      reviewId: string;
      decision: "accepted" | "changes_requested" | "blocked";
      summary: string;
      requiredChanges?: string[];
    }) => lightExecutionApi.decideReview(issueId, reviewId, decision, summary, requiredChanges),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: actionCenterKey(selectedCompanyId!) });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Review decision failed"),
  });

  const reconcile = useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: "succeeded" | "failed_safe"; note: string }) =>
      lightExecutionApi.reconcileAction(selectedCompanyId!, id, outcome, note),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: actionCenterKey(selectedCompanyId!) });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Reconciliation failed"),
  });

  const comment = useMutation({
    mutationFn: ({ issueId, body }: { issueId: string; body: string }) => issuesApi.addComment(issueId, body),
    onSuccess: () => setError(null),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Comment failed"),
  });

  const updateFailedTask = useMutation({
    mutationFn: ({ issueId, status, assigneeAgentId }: {
      issueId: string;
      status: "todo" | "blocked" | "cancelled";
      assigneeAgentId?: string;
    }) => issuesApi.update(issueId, { status, ...(assigneeAgentId ? { assigneeAgentId } : {}) }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: actionCenterKey(selectedCompanyId!) });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Task update failed"),
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">Select an organization first.</p>;
  if (selectedCompany?.executionProfile !== "light") {
    return <p className="text-sm text-muted-foreground">Enable the Light execution profile in Settings to use Action Center.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Action Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Only decisions that need a human. Each card states the unblock action explicitly.</p>
        </div>
        <Badge variant="outline">{items.length} open</Badge>
      </div>

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div> : null}
      {query.isError ? <div className="text-sm text-destructive">{query.error.message}</div> : null}
      {query.isLoading ? <div className="text-sm text-muted-foreground">Loading actions…</div> : null}

      {!query.isLoading && items.length === 0 ? (
        <div className="rounded-lg border border-border py-16 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Nothing needs you</p>
          <p className="mt-1 text-xs text-muted-foreground">Agents can continue autonomously.</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => (
          <article key={`${item.kind}:${item.id}`} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CircleAlert className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium capitalize">{item.title}</h2>
                  <Badge variant="outline" className="capitalize">{item.status.replaceAll("_", " ")}</Badge>
                  {item.riskLevel ? <Badge variant="destructive" className="capitalize">{item.riskLevel}</Badge> : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                {item.issueIdentifier ? <p className="mt-2 text-xs text-muted-foreground">{item.issueIdentifier} · {item.issueTitle}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {item.kind === "human_action" && item.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => decide.mutate({ id: item.id, decision: "approve" })} disabled={decide.isPending}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: item.id, decision: "reject" })} disabled={decide.isPending}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </>
                ) : null}
                {item.kind === "human_action" && item.status === "failed_unknown" ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        const note = window.prompt("Proof that the external effect succeeded:");
                        if (note?.trim()) reconcile.mutate({ id: item.id, outcome: "succeeded", note: note.trim() });
                      }}
                      disabled={reconcile.isPending}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Mark succeeded
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const note = window.prompt("Proof that retrying is safe:");
                        if (note?.trim()) reconcile.mutate({ id: item.id, outcome: "failed_safe", note: note.trim() });
                      }}
                      disabled={reconcile.isPending}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" /> Mark safe failure
                    </Button>
                  </>
                ) : null}
                {item.kind === "review" && item.status === "pending" && item.issueId ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => decideReview.mutate({
                        issueId: item.issueId!,
                        reviewId: item.id,
                        decision: "accepted",
                        summary: "Accepted by a human from Action Center.",
                      })}
                      disabled={decideReview.isPending}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const changes = window.prompt("Exact changes required (one per line):");
                        const requiredChanges = changes?.split("\n").map((value) => value.trim()).filter(Boolean) ?? [];
                        if (requiredChanges.length > 0) decideReview.mutate({
                          issueId: item.issueId!,
                          reviewId: item.id,
                          decision: "changes_requested",
                          summary: "Changes requested by a human from Action Center.",
                          requiredChanges,
                        });
                      }}
                      disabled={decideReview.isPending}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Request changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = window.prompt("Why is this review blocked?");
                        if (reason?.trim()) decideReview.mutate({
                          issueId: item.issueId!, reviewId: item.id, decision: "blocked", summary: reason.trim(),
                        });
                      }}
                      disabled={decideReview.isPending}
                    >
                      <CircleAlert className="mr-1.5 h-3.5 w-3.5" /> Block
                    </Button>
                  </>
                ) : null}
                {item.kind === "failed_task" && item.issueId ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => updateFailedTask.mutate({ issueId: item.issueId!, status: "todo" })}
                      disabled={updateFailedTask.isPending}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (window.confirm(`Cancel ${item.issueIdentifier ?? "this task"}?`)) {
                          updateFailedTask.mutate({ issueId: item.issueId!, status: "cancelled" });
                        }
                      }}
                      disabled={updateFailedTask.isPending}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const choices = (agentsQuery.data ?? [])
                          .filter((agent) => !["terminated", "pending_approval"].includes(agent.status))
                          .map((agent) => `${agent.name}: ${agent.id}`).join("\n");
                        const agentId = window.prompt(`Agent ID to reassign to:\n\n${choices}`);
                        if (agentId?.trim()) updateFailedTask.mutate({
                          issueId: item.issueId!, status: "todo", assigneeAgentId: agentId.trim(),
                        });
                      }}
                      disabled={updateFailedTask.isPending}
                    >
                      <UserRound className="mr-1.5 h-3.5 w-3.5" /> Reassign
                    </Button>
                  </>
                ) : null}
                {item.issueId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const body = window.prompt("Comment to add to the task:");
                      if (body?.trim()) comment.mutate({ issueId: item.issueId!, body: body.trim() });
                    }}
                    disabled={comment.isPending}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Comment
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => navigate(item.href)}>
                  {item.issueId ? "Open task" : "Inspect"} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
