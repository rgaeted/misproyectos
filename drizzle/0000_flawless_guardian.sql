CREATE TYPE "public"."item_kind" AS ENUM('status', 'idea', 'question');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('idea', 'explorando', 'en_desarrollo', 'en_ejecucion', 'en_pausa');--> statement-breakpoint
CREATE TABLE "inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "project_repos_project_id_owner_name_unique" UNIQUE("project_id","owner","name")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"stage" "stage",
	"last_update" text DEFAULT '' NOT NULL,
	"next_step" text DEFAULT '' NOT NULL,
	"no_repo_note" text,
	"external_url" text,
	"sort_order" integer DEFAULT 99 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_snapshots" (
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text,
	"last_commit_at" timestamp with time zone,
	"last_commit_msg" text,
	"open_issues" integer,
	"open_prs" integer,
	"commits_7d" integer,
	"is_private" boolean,
	"fetched_at" timestamp with time zone,
	"error" text,
	"etag_cache" jsonb,
	CONSTRAINT "repo_snapshots_owner_name_pk" PRIMARY KEY("owner","name")
);
--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;