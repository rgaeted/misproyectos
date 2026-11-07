import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  unique,
  primaryKey,
  jsonb,
  index,
  pgPolicy,
  pgSchema,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { stages } from "../stages";
import { stepStates } from "../steps";
const currentUser = sql`nullif(current_setting('app.user_id', true), '')::uuid`;
const customSchema = process.env.DATABASE_SCHEMA && process.env.DATABASE_SCHEMA !== "public"
  ? pgSchema(process.env.DATABASE_SCHEMA) : undefined;
const table = (customSchema?.table || pgTable) as typeof pgTable;
const enumeration = customSchema?.enum || pgEnum;
export const stageEnum = enumeration("stage", stages);
export const kindEnum = enumeration("item_kind", ["status", "idea", "question"]);
export const stepStateEnum = enumeration("step_state", stepStates);
export const users = table("users", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  email: text().unique(),
  passwordHash: text("password_hash"),
  githubId: text("github_id").unique(),
  githubLogin: text("github_login"),
  githubToken: text("github_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();
export const authRateLimits = table("auth_rate_limits", {
  key: text().primaryKey(),
  attempts: integer().notNull(),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
}).enableRLS();
export const projects = table("projects", {
  id: text().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  type: text().notNull().default(""),
  stage: stageEnum(),
  lastUpdate: text("last_update").notNull().default(""),
  nextStep: text("next_step").notNull().default(""),
  noRepoNote: text("no_repo_note"),
  externalUrl: text("external_url"),
  sortOrder: integer("sort_order").notNull().default(99),
  archived: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => [index("projects_user_id_idx").on(t.userId),
  pgPolicy("projects_private", { for: "all", using: sql`${t.userId} = ${currentUser}`, withCheck: sql`${t.userId} = ${currentUser}` }),
]).enableRLS();
export const projectRepos = table(
  "project_repos",
  {
    id: uuid().defaultRandom().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    owner: text().notNull(),
    name: text().notNull(),
  },
  (t) => [unique().on(t.projectId, t.owner, t.name),
    pgPolicy("project_repos_private", { for: "all", using: sql`exists (select 1 from ${projects} where ${projects.id} = ${t.projectId} and ${projects.userId} = ${currentUser})`, withCheck: sql`exists (select 1 from ${projects} where ${projects.id} = ${t.projectId} and ${projects.userId} = ${currentUser})` }),
  ],
).enableRLS();
export const projectSteps = table("project_steps", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  text: text().notNull(),
  state: stepStateEnum().notNull().default("todo"),
  waitingOn: text("waiting_on").notNull().default(""),
  position: integer().notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("project_steps_project_id_idx").on(t.projectId),
  pgPolicy("project_steps_private", {
    for: "all",
    using: sql`exists (select 1 from ${projects} where ${projects.id} = ${t.projectId} and ${projects.userId} = ${currentUser})`,
    withCheck: sql`exists (select 1 from ${projects} where ${projects.id} = ${t.projectId} and ${projects.userId} = ${currentUser})`,
  }),
]).enableRLS();
export const projectItems = table("project_items", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: kindEnum().notNull(),
  text: text().notNull(),
  done: boolean().notNull().default(false),
  position: integer().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => [pgPolicy("project_items_private", { for: "all", using: sql`exists (select 1 from ${projects} where ${projects.id} = ${t.projectId} and ${projects.userId} = ${currentUser})`, withCheck: sql`exists (select 1 from ${projects} where ${projects.id} = ${t.projectId} and ${projects.userId} = ${currentUser})` })]).enableRLS();
export const inbox = table("inbox", {
  id: uuid().defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => [index("inbox_user_id_idx").on(t.userId),
  pgPolicy("inbox_private", { for: "all", using: sql`${t.userId} = ${currentUser}`, withCheck: sql`${t.userId} = ${currentUser}` }),
]).enableRLS();
export const repoSnapshots = table(
  "repo_snapshots",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    owner: text().notNull(),
    name: text().notNull(),
    defaultBranch: text("default_branch"),
    lastCommitAt: timestamp("last_commit_at", { withTimezone: true }),
    lastCommitMsg: text("last_commit_msg"),
    openIssues: integer("open_issues"),
    openPrs: integer("open_prs"),
    commits7d: integer("commits_7d"),
    isPrivate: boolean("is_private"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    error: text(),
    etagCache:
      jsonb("etag_cache").$type<
        Record<string, { etag: string; data: unknown }>
      >(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.owner, t.name] }),
    pgPolicy("repo_snapshots_private", { for: "all", using: sql`${t.userId} = ${currentUser}`, withCheck: sql`${t.userId} = ${currentUser}` }),
  ],
).enableRLS();
