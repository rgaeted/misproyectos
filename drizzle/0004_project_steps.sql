CREATE TYPE "public"."step_state" AS ENUM('todo', 'waiting', 'done');--> statement-breakpoint
CREATE TABLE "project_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"text" text NOT NULL,
	"state" "step_state" DEFAULT 'todo' NOT NULL,
	"waiting_on" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_steps_project_id_idx" ON "project_steps" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "project_steps_private" ON "project_steps" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from "projects" where "projects"."id" = "project_steps"."project_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid)) WITH CHECK (exists (select 1 from "projects" where "projects"."id" = "project_steps"."project_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid));
--> statement-breakpoint
-- The migrator owns these tables; relax FORCE only within this migration transaction.
ALTER TABLE "projects" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO "project_steps" ("project_id", "text", "state", "position") SELECT "id", "next_step", 'todo', 0 FROM "projects" WHERE length(trim("next_step")) > 0;
--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "project_steps" FORCE ROW LEVEL SECURITY;
