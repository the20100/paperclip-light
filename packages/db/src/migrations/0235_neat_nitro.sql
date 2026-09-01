CREATE TABLE "human_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"issue_id" uuid,
	"requesting_agent_id" uuid,
	"requesting_run_id" uuid,
	"action_kind" text NOT NULL,
	"risk_level" text DEFAULT 'high' NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolver_policy" text DEFAULT 'human_only' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"decision_note" text,
	"decided_by_user_id" text,
	"execution_claim" text,
	"receipt" jsonb,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"executing_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "light_execution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"issue_id" uuid NOT NULL,
	"target_agent_id" uuid NOT NULL,
	"run_id" uuid,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_memory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text NOT NULL,
	"text" text NOT NULL,
	"content_hash" text NOT NULL,
	"importance" integer DEFAULT 50 NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"source_issue_id" uuid,
	"source_run_id" uuid,
	"supersedes_id" uuid,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_context_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"component_kind" text NOT NULL,
	"source_entity_type" text,
	"source_entity_id" text,
	"content_hash" text NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"estimated_tokens" integer DEFAULT 0 NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"exclusion_reason" text,
	"duplicate_of_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"requested_by_agent_id" uuid,
	"reviewer_agent_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text,
	"required_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_run_id" uuid,
	"decided_run_id" uuid,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD COLUMN "base_sha" text;--> statement-breakpoint
ALTER TABLE "task_checkpoints" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "human_actions" ADD CONSTRAINT "human_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actions" ADD CONSTRAINT "human_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actions" ADD CONSTRAINT "human_actions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actions" ADD CONSTRAINT "human_actions_requesting_agent_id_agents_id_fk" FOREIGN KEY ("requesting_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actions" ADD CONSTRAINT "human_actions_requesting_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("requesting_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "light_execution_events" ADD CONSTRAINT "light_execution_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "light_execution_events" ADD CONSTRAINT "light_execution_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "light_execution_events" ADD CONSTRAINT "light_execution_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "light_execution_events" ADD CONSTRAINT "light_execution_events_target_agent_id_agents_id_fk" FOREIGN KEY ("target_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "light_execution_events" ADD CONSTRAINT "light_execution_events_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_items" ADD CONSTRAINT "project_memory_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_items" ADD CONSTRAINT "project_memory_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_items" ADD CONSTRAINT "project_memory_items_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_items" ADD CONSTRAINT "project_memory_items_source_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_items" ADD CONSTRAINT "project_memory_items_supersedes_id_project_memory_items_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."project_memory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_context_components" ADD CONSTRAINT "run_context_components_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_context_components" ADD CONSTRAINT "run_context_components_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_context_components" ADD CONSTRAINT "run_context_components_duplicate_of_id_run_context_components_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."run_context_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_requested_by_agent_id_agents_id_fk" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_reviewer_agent_id_agents_id_fk" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_source_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_decided_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("decided_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "human_actions_company_status_created_idx" ON "human_actions" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "human_actions_issue_created_idx" ON "human_actions" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "human_actions_company_idempotency_uq" ON "human_actions" USING btree ("company_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "human_actions_provider_idempotency_uq" ON "human_actions" USING btree ("company_id","provider_idempotency_key");--> statement-breakpoint
CREATE INDEX "light_execution_events_company_created_idx" ON "light_execution_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "light_execution_events_issue_created_idx" ON "light_execution_events" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "light_execution_events_status_created_idx" ON "light_execution_events" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "light_execution_events_company_idempotency_uq" ON "light_execution_events" USING btree ("company_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "light_execution_events_run_uq" ON "light_execution_events" USING btree ("run_id") WHERE "light_execution_events"."run_id" is not null;--> statement-breakpoint
CREATE INDEX "project_memory_items_project_status_importance_idx" ON "project_memory_items" USING btree ("project_id","status","importance","last_confirmed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_memory_items_project_hash_uq" ON "project_memory_items" USING btree ("project_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "run_context_components_run_ordinal_uq" ON "run_context_components" USING btree ("run_id","ordinal");--> statement-breakpoint
CREATE INDEX "run_context_components_run_kind_idx" ON "run_context_components" USING btree ("run_id","component_kind");--> statement-breakpoint
CREATE INDEX "run_context_components_company_created_idx" ON "run_context_components" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_reviews_issue_revision_uq" ON "task_reviews" USING btree ("issue_id","revision");--> statement-breakpoint
CREATE INDEX "task_reviews_reviewer_status_idx" ON "task_reviews" USING btree ("company_id","reviewer_agent_id","status");--> statement-breakpoint
CREATE INDEX "task_reviews_issue_status_idx" ON "task_reviews" USING btree ("issue_id","status");