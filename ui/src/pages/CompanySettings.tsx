import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  lightCompanyConfigSchema,
  type LightCompanyConfig,
  type InteractionResolverGovernance,
  type IssueThreadInteractionKind,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCloudInstance } from "../hooks/useCloudInstance";
import { companiesApi } from "../api/companies";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, SlidersHorizontal } from "lucide-react";
import {
  InteractionGovernancePanel,
  applyGovernanceChange,
  type GovernanceField,
  type GovernanceSelectValue,
} from "../components/InteractionGovernancePanel";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";
import { InstanceGeneralSettings } from "./InstanceGeneralSettings";
import { lightExecutionApi } from "../api/lightExecution";
import { useLocation } from "../lib/router";

const DEFAULT_LIGHT_CONFIG: LightCompanyConfig = {
  maxConcurrentRuns: 4,
  maxTaskDepth: 3,
  maxChildrenPerTask: 12,
  maxTasksPerTree: 50,
  technicalRetryLimit: 2,
  maxReviewCycles: 10,
  maxCrossAgentMentionsPerTree: 5,
  taskSessionIsolation: true,
  maxSessionRuns: 6,
  maxSessionInputTokens: 100_000,
  maxSessionAgeHours: 24,
  routineConcurrencyPolicy: "skip_if_active",
  routineCatchUpPolicy: "skip_missed",
  logRetentionDays: 30,
  contextTokenBudget: 16_000,
  projectMemoryTokenBudget: 2_000,
  contextComponentBudgets: {
    protocol: 700,
    projectBrief: 800,
    projectMemory: 1_500,
    task: 4_000,
    eventDelta: 1_500,
    recentComments: 1_000,
    continuationSummary: 1_000,
    skillManifest: 400,
    selectedSkills: 4_000,
    reservedOutput: 2_000,
  },
  deterministicHealthCheckSeconds: 300,
  requireHumanApprovalForExternalEffects: true,
  allowAgentCreationWithoutApproval: false,
  modelRegistry: [],
  providerHealthTtlSeconds: 300,
  qualityAnalyticsWindowDays: 30,
};

function normalizeLightConfig(value: unknown): LightCompanyConfig {
  const parsed = lightCompanyConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_LIGHT_CONFIG;
}

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const location = useLocation();
  const isLightRoute = location.pathname.endsWith("/light");
  // Managed instances derive the task ID prefix from the company name, so a
  // rename here also renumbers the existing task IDs.
  const isCloudManaged = Boolean(useCloudInstance());
  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [governance, setGovernance] = useState<InteractionResolverGovernance>({});
  const [executionProfile, setExecutionProfile] = useState<"standard" | "light">("standard");
  const [lightConfig, setLightConfig] = useState<LightCompanyConfig>(DEFAULT_LIGHT_CONFIG);
  const migrationPreview = useQuery({
    queryKey: ["light", "migration-preview", selectedCompanyId],
    queryFn: () => lightExecutionApi.migrationPreview(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && selectedCompany?.executionProfile === "light"),
    retry: false,
  });
  const configurationRevisions = useQuery({
    queryKey: ["light", "config-revisions", selectedCompanyId],
    queryFn: () => lightExecutionApi.configurationRevisions(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && selectedCompany?.executionProfile === "light"),
  });

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setLogoUrl(selectedCompany.logoUrl ?? "");
    setGovernance(selectedCompany.interactionResolverGovernance ?? {});
    setExecutionProfile(selectedCompany.executionProfile ?? "standard");
    setLightConfig(normalizeLightConfig(selectedCompany.lightConfig));
  }, [selectedCompany]);

  useEffect(() => {
    if (!location.pathname.endsWith("/light")) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("light-execution-settings")?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const lightMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, {
      executionProfile,
      lightConfig: lightCompanyConfigSchema.parse(lightConfig),
    }),
    onSuccess: (company) => {
      setExecutionProfile(company.executionProfile ?? "standard");
      setLightConfig(normalizeLightConfig(company.lightConfig));
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });
  const rollbackMutation = useMutation({
    mutationFn: (revision: number) => lightExecutionApi.rollbackConfiguration(
      selectedCompanyId!,
      revision,
      `Restored from Settings to revision ${revision}`,
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      void queryClient.invalidateQueries({ queryKey: ["light", "config-revisions", selectedCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["light", "migration-preview", selectedCompanyId] });
    },
  });

  const lightDirty =
    executionProfile !== (selectedCompany?.executionProfile ?? "standard")
    || JSON.stringify(lightConfig) !== JSON.stringify(normalizeLightConfig(selectedCompany?.lightConfig));

  function updateLightNumber(key: keyof LightCompanyConfig, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setLightConfig((current) => ({ ...current, [key]: Math.max(0, Math.floor(parsed)) }));
  }

  const governanceMutation = useMutation({
    mutationFn: (next: InteractionResolverGovernance) =>
      companiesApi.update(selectedCompanyId!, { interactionResolverGovernance: next }),
    onSuccess: (company) => {
      setGovernance(company.interactionResolverGovernance ?? {});
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  function handleGovernanceChange(
    kind: IssueThreadInteractionKind,
    field: GovernanceField,
    value: GovernanceSelectValue,
  ) {
    const next = applyGovernanceChange(governance, kind, field, value);
    setGovernance(next);
    governanceMutation.mutate(next);
  }

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No organization selected. Select an organization from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null
    });
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{isLightRoute ? "Light execution" : "General"}</h1>
      </div>

      <div className={isLightRoute ? "hidden" : "contents"}>
      {/* General */}
      <div className="max-w-2xl space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          General
        </div>
        <div className="space-y-3">
          <Field label="Organization name" hint="The display name for your organization.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            {isCloudManaged && (
              <p className="mt-1 text-xs text-muted-foreground">
                Renaming can change this company's task ID prefix. Existing task IDs are
                renumbered and old task links stop resolving.
              </p>
            )}
          </Field>
          <Field
            label="Description"
            hint="Optional description shown in the organization profile."
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder="Optional organization description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="max-w-2xl space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Appearance
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                className="rounded-(--rad-14)"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label="Logo"
                hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image."
              >
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : "Logo upload failed")}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">Uploading logo...</span>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
          >
            {generalMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : "Failed to save"}
            </span>
          )}
        </div>
      )}
      </div>

      {/* Agent execution */}
      <div id="light-execution-settings" className="max-w-2xl scroll-mt-6 space-y-4" data-testid="company-settings-execution-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Agent execution
        </div>
        <Field
          label="Execution profile"
          hint="Light runs agents only from assignments, explicit mentions or resumes, reviews, routines, dependency changes, and released file reservations. Interval heartbeats and ordinary comment wakes are disabled."
        >
          <select
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={executionProfile}
            onChange={(event) => setExecutionProfile(event.target.value as "standard" | "light")}
          >
            <option value="standard">Standard</option>
            <option value="light">Light — event-driven and token-efficient</option>
          </select>
        </Field>
        {executionProfile === "light" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Concurrent runs" hint="Maximum agent runs for this company.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={256}
                value={lightConfig.maxConcurrentRuns}
                onChange={(event) => updateLightNumber("maxConcurrentRuns", event.target.value)}
              />
            </Field>
            <Field label="Technical retries" hint="Retries after adapter or provider failure.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={0}
                max={10}
                value={lightConfig.technicalRetryLimit}
                onChange={(event) => updateLightNumber("technicalRetryLimit", event.target.value)}
              />
            </Field>
            <Field label="Review cycles" hint="Maximum manager review loops before the task needs a human.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={10}
                value={lightConfig.maxReviewCycles}
                onChange={(event) => updateLightNumber("maxReviewCycles", event.target.value)}
              />
            </Field>
            <Field label="Cross-task actions" hint="Maximum writes to other tasks from one agent run; prevents collaboration loops.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={0}
                max={100}
                value={lightConfig.maxCrossAgentMentionsPerTree}
                onChange={(event) => updateLightNumber("maxCrossAgentMentionsPerTree", event.target.value)}
              />
            </Field>
            <Field label="Context token budget" hint="Hard target for a task turn.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1000}
                step={1000}
                value={lightConfig.contextTokenBudget}
                onChange={(event) => updateLightNumber("contextTokenBudget", event.target.value)}
              />
            </Field>
            <Field label="Project memory budget" hint="Compact persistent memory per project.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={256}
                step={256}
                value={lightConfig.projectMemoryTokenBudget}
                onChange={(event) => updateLightNumber("projectMemoryTokenBudget", event.target.value)}
              />
            </Field>
            <Field label="Runs per task session" hint="Reset a task session after this many model runs.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={100}
                value={lightConfig.maxSessionRuns}
                onChange={(event) => updateLightNumber("maxSessionRuns", event.target.value)}
              />
            </Field>
            <Field label="Session input token ceiling" hint="Reset before accumulated session input exceeds this estimate.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1000}
                step={1000}
                value={lightConfig.maxSessionInputTokens}
                onChange={(event) => updateLightNumber("maxSessionInputTokens", event.target.value)}
              />
            </Field>
            <Field label="Session age (hours)" hint="Reset stale task sessions after this duration.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={720}
                value={lightConfig.maxSessionAgeHours}
                onChange={(event) => updateLightNumber("maxSessionAgeHours", event.target.value)}
              />
            </Field>
            <Field label="Task-tree depth" hint="Maximum parent/subtask depth.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={8}
                value={lightConfig.maxTaskDepth}
                onChange={(event) => updateLightNumber("maxTaskDepth", event.target.value)}
              />
            </Field>
            <Field label="Children per task" hint="Maximum direct subtasks.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={100}
                value={lightConfig.maxChildrenPerTask}
                onChange={(event) => updateLightNumber("maxChildrenPerTask", event.target.value)}
              />
            </Field>
            <Field label="Tasks per tree" hint="Maximum total parent and descendant tasks.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={2}
                max={1000}
                value={lightConfig.maxTasksPerTree}
                onChange={(event) => updateLightNumber("maxTasksPerTree", event.target.value)}
              />
            </Field>
            <Field label="Log retention (days)" hint="Run logs are deleted after this window; task history stays.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={365}
                value={lightConfig.logRetentionDays}
                onChange={(event) => updateLightNumber("logRetentionDays", event.target.value)}
              />
            </Field>
            <Field label="Health check (seconds)" hint="Free deterministic check interval; it does not wake a model.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={30}
                value={lightConfig.deterministicHealthCheckSeconds}
                onChange={(event) => updateLightNumber("deterministicHealthCheckSeconds", event.target.value)}
              />
            </Field>
            <Field label="Provider health TTL (seconds)" hint="After this delay, provider health is treated as stale instead of blocking routing.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={30}
                value={lightConfig.providerHealthTtlSeconds}
                onChange={(event) => updateLightNumber("providerHealthTtlSeconds", event.target.value)}
              />
            </Field>
            <Field label="Quality window (days)" hint="Window used for review and cost-per-accepted-task analytics.">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={365}
                value={lightConfig.qualityAnalyticsWindowDays}
                onChange={(event) => updateLightNumber("qualityAnalyticsWindowDays", event.target.value)}
              />
            </Field>
            <Field label="Routine overlap" hint="What happens when the previous routine task is still active.">
              <select
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                value={lightConfig.routineConcurrencyPolicy}
                onChange={(event) => setLightConfig((current) => ({
                  ...current,
                  routineConcurrencyPolicy: event.target.value as LightCompanyConfig["routineConcurrencyPolicy"],
                }))}
              >
                <option value="skip_if_active">Block this occurrence and record the conflict</option>
                <option value="coalesce_if_active">Keep one occurrence queued</option>
                <option value="always_enqueue">Allow parallel occurrences</option>
              </select>
            </Field>
            <Field label="Missed routines" hint="Choose whether downtime creates catch-up work.">
              <select
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                value={lightConfig.routineCatchUpPolicy}
                onChange={(event) => setLightConfig((current) => ({
                  ...current,
                  routineCatchUpPolicy: event.target.value as LightCompanyConfig["routineCatchUpPolicy"],
                }))}
              >
                <option value="skip_missed">Skip missed occurrences</option>
                <option value="enqueue_missed_with_cap">Catch up missed work with a safety cap</option>
              </select>
            </Field>
          </div>
        )}
        {executionProfile === "light" && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">Context allocation</p>
              <p className="text-xs text-muted-foreground">Per-component ceilings. Unchanged components are omitted on resumed sessions.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["protocol", "Protocol"],
                ["projectBrief", "Project brief"],
                ["projectMemory", "Project memory"],
                ["task", "Task brief"],
                ["eventDelta", "Event delta"],
                ["recentComments", "Recent comments"],
                ["continuationSummary", "Continuation summary"],
                ["skillManifest", "Skill manifest"],
                ["selectedSkills", "Selected skills"],
                ["reservedOutput", "Reserved output"],
              ] as const).map(([key, label]) => (
                <Field key={key} label={`${label} tokens`} hint={`Maximum tokens allocated to ${label.toLowerCase()}.`}>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    type="number"
                    min={0}
                    step={100}
                    value={lightConfig.contextComponentBudgets[key]}
                    onChange={(event) => setLightConfig((current) => ({
                      ...current,
                      contextComponentBudgets: {
                        ...current.contextComponentBudgets,
                        [key]: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                      },
                    }))}
                  />
                </Field>
              ))}
            </div>
          </div>
        )}
        {executionProfile === "light" && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Model registry</p>
                <p className="text-xs text-muted-foreground">Auto routing uses capability, health, context, price, and quality. Empty keeps each agent's fixed adapter model.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLightConfig((current) => ({
                  ...current,
                  modelRegistry: [...current.modelRegistry, {
                    provider: "openrouter",
                    modelId: "",
                    adapterType: null,
                    displayName: "",
                    contextWindowTokens: null,
                    maxOutputTokens: null,
                    capabilities: [],
                    supportsTools: true,
                    supportsStructuredOutput: false,
                    supportsVision: false,
                    supportsSessionResume: false,
                    executionLocation: "remote",
                    inputPricePerMillion: null,
                    cachedInputPricePerMillion: null,
                    outputPricePerMillion: null,
                    enabled: true,
                    health: "unknown",
                    healthReason: null,
                    lastCheckedAt: null,
                    qualityScore: 50,
                  }],
                }))}
              >
                Add model
              </Button>
            </div>
            {lightConfig.modelRegistry.length === 0 ? (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">No registry model yet. Fixed per-agent routing remains active.</p>
            ) : (
              <div className="space-y-3">
                {lightConfig.modelRegistry.map((model, index) => {
                  const updateModel = (patch: Partial<typeof model>) => setLightConfig((current) => ({
                    ...current,
                    modelRegistry: current.modelRegistry.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry),
                  }));
                  return (
                    <div key={`${index}:${model.provider}:${model.modelId}`} className="space-y-3 rounded-md border border-border p-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Provider"><input className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.provider} onChange={(event) => updateModel({ provider: event.target.value })} /></Field>
                        <Field label="Model ID"><input className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.modelId} onChange={(event) => updateModel({ modelId: event.target.value })} /></Field>
                        <Field label="Display name"><input className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.displayName} onChange={(event) => updateModel({ displayName: event.target.value })} /></Field>
                        <Field label="Adapter" hint="Paperclip adapter that runs this model. Agent default keeps each agent's own adapter."><select className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.adapterType ?? ""} onChange={(event) => updateModel({ adapterType: event.target.value || null })}><option value="">Agent default</option><option value="claude_local">Claude Code</option><option value="codex_local">Codex</option><option value="opencode_local">OpenCode</option></select></Field>
                        <Field label="Context window"><input type="number" className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.contextWindowTokens ?? ""} onChange={(event) => updateModel({ contextWindowTokens: event.target.value ? Number(event.target.value) : null })} /></Field>
                        <Field label="Input $ / 1M"><input type="number" step="0.01" className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.inputPricePerMillion ?? ""} onChange={(event) => updateModel({ inputPricePerMillion: event.target.value ? Number(event.target.value) : null })} /></Field>
                        <Field label="Output $ / 1M"><input type="number" step="0.01" className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.outputPricePerMillion ?? ""} onChange={(event) => updateModel({ outputPricePerMillion: event.target.value ? Number(event.target.value) : null })} /></Field>
                        <Field label="Quality score"><input type="number" min={0} max={100} className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.qualityScore} onChange={(event) => updateModel({ qualityScore: Number(event.target.value) })} /></Field>
                        <Field label="Capabilities" hint="Comma separated, e.g. coding, tools, vision."><input className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.capabilities.join(", ")} onChange={(event) => updateModel({ capabilities: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></Field>
                        <Field label="Health"><select className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" value={model.health} onChange={(event) => updateModel({ health: event.target.value as typeof model.health })}><option value="unknown">Unknown</option><option value="available">Available</option><option value="degraded">Degraded</option><option value="unavailable">Unavailable</option></select></Field>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={model.enabled} onChange={(event) => updateModel({ enabled: event.target.checked })} /> Enabled</label>
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={model.supportsTools} onChange={(event) => updateModel({ supportsTools: event.target.checked })} /> Tools</label>
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={model.supportsVision} onChange={(event) => updateModel({ supportsVision: event.target.checked })} /> Vision</label>
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={model.supportsSessionResume} onChange={(event) => updateModel({ supportsSessionResume: event.target.checked })} /> Session resume</label>
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLightConfig((current) => ({ ...current, modelRegistry: current.modelRegistry.filter((_, entryIndex) => entryIndex !== index) }))}>Remove</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {executionProfile === "light" && (
          <div className="space-y-2">
            <ToggleField
              label="Isolate sessions by task"
              hint="Never reuse a model session across different tasks."
              checked={lightConfig.taskSessionIsolation}
              onChange={(checked) => setLightConfig((current) => ({
                ...current,
                taskSessionIsolation: checked,
              }))}
            />
            <ToggleField
              label="Require approval for external effects"
              hint="Require a human before payment, email, publication, deletion, or deployment."
              checked={lightConfig.requireHumanApprovalForExternalEffects}
              onChange={(checked) => setLightConfig((current) => ({
                ...current,
                requireHumanApprovalForExternalEffects: checked,
              }))}
            />
            <ToggleField
              label="Allow autonomous agent creation"
              hint="Off by default. Managers must request human approval before creating agents."
              checked={lightConfig.allowAgentCreationWithoutApproval}
              onChange={(checked) => setLightConfig((current) => ({
                ...current,
                allowAgentCreationWithoutApproval: checked,
              }))}
            />
          </div>
        )}
        {lightDirty && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => lightMutation.mutate()} disabled={lightMutation.isPending}>
              {lightMutation.isPending ? "Saving..." : "Save execution settings"}
            </Button>
            {lightMutation.isError && (
              <span className="text-xs text-destructive">
                {lightMutation.error instanceof Error ? lightMutation.error.message : "Failed to save execution settings"}
              </span>
            )}
          </div>
        )}
      </div>

      {executionProfile === "light" && (
        <div className="max-w-2xl space-y-4" data-testid="company-settings-light-readiness">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Light readiness
          </div>
          <div className="rounded-lg border border-border p-4">
            {selectedCompany?.executionProfile !== "light" ? (
              <p className="text-sm text-muted-foreground">Save the Light execution profile to run the readiness check.</p>
            ) : migrationPreview.isLoading ? (
              <p className="text-sm text-muted-foreground">Checking agents and projects…</p>
            ) : migrationPreview.isError ? (
              <p className="text-sm text-destructive">{migrationPreview.error.message}</p>
            ) : migrationPreview.data ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {migrationPreview.data.ready ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm font-medium">
                    {migrationPreview.data.ready ? "No blocking migration issue" : "Migration has blockers"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {migrationPreview.data.counts.agents} agents · {migrationPreview.data.counts.projects} projects · {migrationPreview.data.counts.warnings} warnings
                  </span>
                </div>
                {migrationPreview.data.findings.length > 0 ? (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {migrationPreview.data.findings.slice(0, 20).map((finding) => (
                      <div key={`${finding.code}:${finding.entityId}`} className="flex items-start gap-2 px-3 py-2">
                        <span className="mt-0.5 text-xs font-medium uppercase text-muted-foreground">{finding.severity}</span>
                        <p className="text-xs leading-5 text-muted-foreground">{finding.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Every agent has a review chain and every project uses the shared-repository broker.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {executionProfile === "light" && selectedCompany?.executionProfile === "light" && (
        <div className="max-w-2xl space-y-4" data-testid="company-settings-light-revisions">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Configuration history</div>
          <div className="divide-y divide-border rounded-lg border border-border">
            {(configurationRevisions.data ?? []).slice(0, 10).map((revision, index) => (
              <div key={revision.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Revision {revision.revision}{index === 0 ? " · current" : ""}</p>
                  <p className="text-xs text-muted-foreground">{revision.changeSummary ?? "Light configuration update"}</p>
                </div>
                {index > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rollbackMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Restore Light configuration revision ${revision.revision}?`)) {
                        rollbackMutation.mutate(revision.revision);
                      }
                    }}
                  >
                    Restore
                  </Button>
                ) : null}
              </div>
            ))}
            {!configurationRevisions.isLoading && (configurationRevisions.data?.length ?? 0) === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">The first saved Light change will create a restorable revision.</p>
            ) : null}
          </div>
        </div>
      )}

      <div className={isLightRoute ? "hidden" : "contents"}>
      {/* Hiring */}
      <div className="max-w-2xl space-y-4" data-testid="company-settings-team-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Hiring
        </div>
        <div>
          <ToggleField
            label="Require board approval for new hires"
            hint="New agent hires stay pending until approved by board."
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
            toggleTestId="company-settings-team-approval-toggle"
          />
        </div>
      </div>

      {/* Interaction governance */}
      <InteractionGovernancePanel
        governance={governance}
        onChange={handleGovernanceChange}
        isPending={governanceMutation.isPending}
        errorMessage={
          governanceMutation.isError
            ? governanceMutation.error instanceof Error
              ? governanceMutation.error.message
              : "Failed to save interaction governance"
            : null
        }
      />

      <InstanceGeneralSettings embedded />

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          Danger Zone
        </div>
        <div className="space-y-3 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Archive this organization to hide it from the sidebar. This persists in
            the database.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `Archive organization "${selectedCompany.name}"? It will be hidden from the sidebar.`
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? "Archiving..."
                : selectedCompany.status === "archived"
                ? "Already archived"
                : "Archive organization"}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : "Failed to archive organization"}
              </span>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
