CREATE TABLE "day_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"step_id" uuid,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "day_list_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "day_lists" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "day_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_steps" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "day_list_items" ADD CONSTRAINT "day_list_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_list_items" ADD CONSTRAINT "day_list_items_step_id_project_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."project_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_lists" ADD CONSTRAINT "day_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_list_items_user_id_idx" ON "day_list_items" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "day_list_items_private" ON "day_list_items" AS PERMISSIVE FOR ALL TO public USING ("day_list_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("day_list_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "day_lists_private" ON "day_lists" AS PERMISSIVE FOR ALL TO public USING ("day_lists"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("day_lists"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "day_lists" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "day_list_items" FORCE ROW LEVEL SECURITY;
