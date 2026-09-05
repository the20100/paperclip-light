import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MonitorPlay, RefreshCw, Router, X } from "lucide-react";
import type { WorkspaceRuntimeService } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function isBrowserUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isLoopbackUrl(value: string): boolean {
  const host = new URL(value).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

type TaskBrowserPanelProps = {
  issueId: string;
  runtimeServices?: WorkspaceRuntimeService[] | null;
  onClose?: () => void;
  className?: string;
};

/**
 * A task-scoped visual preview. It deliberately uses the URL already owned by
 * a workspace runtime service instead of opening arbitrary server-side URLs.
 * A manual address is useful when Paperclip and a project are both running on
 * the operator's machine (for example http://localhost:5173).
 */
export function TaskBrowserPanel({ issueId, runtimeServices, onClose, className }: TaskBrowserPanelProps) {
  const storageKey = `paperclip:task-browser:${issueId}`;
  const services = useMemo(
    () => (runtimeServices ?? []).filter((service) => isBrowserUrl(service.url)),
    [runtimeServices],
  );
  const defaultUrl = services.find((service) => service.status === "running")?.url ?? services[0]?.url ?? "";
  const [address, setAddress] = useState(defaultUrl);
  const [draftAddress, setDraftAddress] = useState(defaultUrl);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && isBrowserUrl(stored)) {
        setAddress(stored);
        setDraftAddress(stored);
      } else if (!address && defaultUrl) {
        setAddress(defaultUrl);
        setDraftAddress(defaultUrl);
      }
    } catch {
      if (!address && defaultUrl) {
        setAddress(defaultUrl);
        setDraftAddress(defaultUrl);
      }
    }
  // A task change must not retain another task's address.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  useEffect(() => {
    if (!address && defaultUrl) {
      setAddress(defaultUrl);
      setDraftAddress(defaultUrl);
    }
  }, [address, defaultUrl]);

  const validAddress = isBrowserUrl(address) ? address : null;
  const submitAddress = () => {
    const next = draftAddress.trim();
    if (!isBrowserUrl(next)) return;
    setAddress(next);
    setFrameKey((value) => value + 1);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Preview storage is a convenience only.
    }
  };

  return (
    <aside className={cn("flex min-h-0 flex-col bg-background", className)} aria-label="Project browser">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <MonitorPlay className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Navigateur</p>
          <p className="truncate text-xs text-muted-foreground">Aperçu du projet de cette tâche</p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close browser" title="Close browser">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <form
        className="flex shrink-0 gap-2 border-b border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitAddress();
        }}
      >
        <Input
          aria-label="Preview URL"
          value={draftAddress}
          onChange={(event) => setDraftAddress(event.target.value)}
          placeholder="http://localhost:5173"
          className="min-w-0 font-mono text-xs"
        />
        <Button type="submit" variant="outline" size="icon-xs" disabled={!isBrowserUrl(draftAddress.trim())} title="Open preview">
          <Router className="h-4 w-4" />
        </Button>
      </form>

      {services.length > 0 ? (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-3 py-2">
          {services.map((service) => (
            <Button
              key={service.id}
              variant={service.url === address ? "secondary" : "ghost"}
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => {
                setDraftAddress(service.url ?? "");
                setAddress(service.url ?? "");
                setFrameKey((value) => value + 1);
              }}
            >
              <span className={cn("h-2 w-2 rounded-full", service.status === "running" ? "bg-status-agent-active" : "bg-muted-foreground")} />
              {service.serviceName}
            </Button>
          ))}
        </div>
      ) : null}

      {validAddress ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <Badge variant="outline" className="max-w-full truncate font-mono text-xs">{validAddress}</Badge>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-xs" onClick={() => setFrameKey((value) => value + 1)} aria-label="Refresh preview" title="Refresh preview">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-xs" asChild>
                <a href={validAddress} target="_blank" rel="noreferrer" aria-label="Open preview in a new tab" title="Open in a new tab">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
          {isLoopbackUrl(validAddress) ? (
            <p className="shrink-0 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Cette adresse s’ouvre sur l’appareil qui consulte Paperclip. Pour un projet sur le VPS, utilisez l’URL HTTPS exposée par son service.
            </p>
          ) : null}
          <iframe
            key={`${validAddress}:${frameKey}`}
            src={validAddress}
            title="Project preview"
            className="min-h-0 flex-1 border-0 bg-card"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <MonitorPlay className="h-8 w-8 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Aucun aperçu disponible</p>
            <p className="text-xs text-muted-foreground">
              Démarrez un service dans le workspace ou saisissez l’URL locale du projet.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
