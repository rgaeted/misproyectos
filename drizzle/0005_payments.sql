CREATE TYPE "public"."plan_kind" AS ENUM('once', 'installments', 'monthly');--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"concept" text NOT NULL,
	"kind" "plan_kind" NOT NULL,
	"amount_uf" numeric(10, 2) NOT NULL,
	"start_date" date NOT NULL,
	"installments" integer,
	"end_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_uf" numeric(10, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"uf_value" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_plan_id_seq_unique" UNIQUE("plan_id","seq")
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_payment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_plans_project_id_idx" ON "payment_plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payments_plan_id_idx" ON "payments" USING btree ("plan_id");--> statement-breakpoint
CREATE POLICY "payment_plans_private" ON "payment_plans" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from "projects" where "projects"."id" = "payment_plans"."project_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid)) WITH CHECK (exists (select 1 from "projects" where "projects"."id" = "payment_plans"."project_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "payments_private" ON "payments" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from "payment_plans" join "projects" on "projects"."id" = "payment_plans"."project_id" where "payment_plans"."id" = "payments"."plan_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid)) WITH CHECK (exists (select 1 from "payment_plans" join "projects" on "projects"."id" = "payment_plans"."project_id" where "payment_plans"."id" = "payments"."plan_id" and "projects"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid));
--> statement-breakpoint
ALTER TABLE "payment_plans" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
