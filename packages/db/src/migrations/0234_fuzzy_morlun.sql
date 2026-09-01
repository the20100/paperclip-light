CREATE TABLE "file_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_workspace_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid,
	"path" text NOT NULL,
	"normalized_path" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"blocked_by_reservation_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_renewed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_workspace_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"paths" jsonb,
	"target_branch" text,
	"commit_sha" text,
	"exit_code" text,
	"stdout_excerpt" text,
	"stderr_excerpt" text,
	"error" text,
	"metadata" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_workspace_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid,
	"kind" text DEFAULT 'working_diff' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"patch_store" text,
	"patch_ref" text,
	"patch_sha256" text,
	"summary" text,
	"metadata" jsonb,
	"restored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "issues_open_routine_execution_uq";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "execution_profile" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "light_config" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "file_reservations" ADD CONSTRAINT "file_reservations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_reservations" ADD CONSTRAINT "file_reservations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_reservations" ADD CONSTRAINT "file_reservations_project_workspace_id_project_workspaces_id_fk" FOREIGN KEY ("project_workspace_id") REFERENCES "public"."project_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_reservations" ADD CONSTRAINT "file_reservations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_reservations" ADD CONSTRAINT "file_reservations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_reservations" ADD CONSTRAINT "file_reservations_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_reservations" ADD CONSTRAINT "file_reservations_blocked_by_reservation_id_file_reservations_id_fk" FOREIGN KEY ("blocked_by_reservation_id") REFERENCES "public"."file_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_operations" ADD CONSTRAINT "repository_operations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_operations" ADD CONSTRAINT "repository_operations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_operations" ADD CONSTRAINT "repository_operations_project_workspace_id_project_workspaces_id_fk" FOREIGN KEY ("project_workspace_id") REFERENCES "public"."project_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_operations" ADD CONSTRAINT "repository_operations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_operations" ADD CONSTRAINT "repository_operations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_operations" ADD CONSTRAINT "repository_operations_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD CONSTRAINT "task_checkpoints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD CONSTRAINT "task_checkpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD CONSTRAINT "task_checkpoints_project_workspace_id_project_workspaces_id_fk" FOREIGN KEY ("project_workspace_id") REFERENCES "public"."project_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD CONSTRAINT "task_checkpoints_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD CONSTRAINT "task_checkpoints_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD CONSTRAINT "task_checkpoints_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_reservations_project_status_path_idx" ON "file_reservations" USING btree ("project_id","status","normalized_path");--> statement-breakpoint
CREATE INDEX "file_reservations_issue_status_idx" ON "file_reservations" USING btree ("issue_id","status");--> statement-breakpoint
CREATE INDEX "file_reservations_request_idx" ON "file_reservations" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_reservations_active_exact_path_uq" ON "file_reservations" USING btree ("project_id","project_workspace_id","normalized_path") WHERE "file_reservations"."status" in ('active', 'orphaned');--> statement-breakpoint
CREATE INDEX "repository_operations_project_created_idx" ON "repository_operations" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "repository_operations_issue_created_idx" ON "repository_operations" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_operations_active_workspace_uq" ON "repository_operations" USING btree ("project_workspace_id") WHERE "repository_operations"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "task_checkpoints_issue_created_idx" ON "task_checkpoints" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "task_checkpoints_run_created_idx" ON "task_checkpoints" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_open_routine_execution_uq" ON "issues" USING btree ("company_id","origin_kind","origin_id","origin_fingerprint") WHERE "issues"."origin_kind" = 'routine_execution'
          and "issues"."origin_id" is not null
          and "issues"."hidden_at" is null
          and "issues"."execution_run_id" is not null
          and "issues"."status" in ('backlog', 'todo', 'in_progress', 'in_review', 'paused', 'blocked');