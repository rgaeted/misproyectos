CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"step_id" uuid,
	"task_text" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_step_id_project_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."project_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_running" ON "time_entries" USING btree ("project_id") WHERE ended_at is null;--> statement-breakpoint
CREATE INDEX "time_entries_project_started_idx" ON "time_entries" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE POLICY "time_entries_private" ON "time_entries" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from "projects" where "projects"."id" = "time_entries"."project_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid)) WITH CHECK (exists (select 1 from "projects" where "projects"."id" = "time_entries"."project_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid));
--> statement-breakpoint
ALTER TABLE "time_entries" FORCE ROW LEVEL SECURITY;
