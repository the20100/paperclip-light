import { useEffect } from "react";
import { Files, SquareTerminal } from "lucide-react";
import { WorkbenchFiles } from "../components/WorkbenchFiles";
import { WorkbenchTerminal } from "../components/WorkbenchTerminal";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";

function WorkbenchPage({ kind }: { kind: "files" | "terminal" }) {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const title = kind === "files" ? "Files" : "Terminal";
  const Icon = kind === "files" ? Files : SquareTerminal;

  useEffect(() => {
    setBreadcrumbs([{ label: "Work" }, { label: title }]);
  }, [setBreadcrumbs, title]);

  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">Select a company to open its workspace.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {kind === "files"
              ? "Browse and edit the files available to this company on the host."
              : "Run commands from this company’s main folder on the host."}
          </p>
        </div>
      </div>
      {kind === "files"
        ? <WorkbenchFiles companyId={selectedCompanyId} />
        : <WorkbenchTerminal companyId={selectedCompanyId} />}
    </div>
  );
}

export function CompanyFiles() {
  return <WorkbenchPage kind="files" />;
}

export function CompanyTerminal() {
  return <WorkbenchPage kind="terminal" />;
}
