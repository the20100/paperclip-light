CREATE TABLE "light_configuration_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_summary" text,
	"created_by_actor_type" text DEFAULT 'system' NOT NULL,
	"created_by_actor_id" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "light_configuration_revisions" ADD CONSTRAINT "light_configuration_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "light_configuration_revisions_scope_revision_uq" ON "light_configuration_revisions" USING btree ("scope_type","scope_id","revision");--> statement-breakpoint
CREATE INDEX "light_configuration_revisions_company_scope_created_idx" ON "light_configuration_revisions" USING btree ("company_id","scope_type","scope_id","created_at");