DROP INDEX "file_reservations_active_exact_path_uq";--> statement-breakpoint
DROP INDEX "repository_operations_active_workspace_uq";--> statement-breakpoint
ALTER TABLE "file_reservations" ADD COLUMN "workspace_scope_key" text;--> statement-breakpoint
UPDATE "file_reservations" AS "reservation"
SET "workspace_scope_key" = COALESCE(
  (SELECT "cwd" FROM "project_workspaces" WHERE "id" = "reservation"."project_workspace_id"),
  'project-workspace:' || "reservation"."project_workspace_id"::text
);--> statement-breakpoint
ALTER TABLE "file_reservations" ALTER COLUMN "workspace_scope_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repository_operations" ADD COLUMN "workspace_scope_key" text;--> statement-breakpoint
UPDATE "repository_operations" AS "operation"
SET "workspace_scope_key" = COALESCE(
  (SELECT "cwd" FROM "project_workspaces" WHERE "id" = "operation"."project_workspace_id"),
  'project-workspace:' || "operation"."project_workspace_id"::text
);--> statement-breakpoint
ALTER TABLE "repository_operations" ALTER COLUMN "workspace_scope_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_reservations_active_exact_path_uq" ON "file_reservations" USING btree ("company_id","workspace_scope_key","normalized_path") WHERE "file_reservations"."status" in ('active', 'orphaned');--> statement-breakpoint
CREATE UNIQUE INDEX "repository_operations_active_workspace_uq" ON "repository_operations" USING btree ("company_id","workspace_scope_key") WHERE "repository_operations"."status" in ('queued', 'running');
