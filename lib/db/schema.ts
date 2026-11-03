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
} from "drizzle-orm/pg-core";
import { stages } from "../stages";
export const stageEnum = pgEnum("stage", stages);
export const kindEnum = pgEnum("item_kind", ["status", "idea", "question"]);
export const projects = pgTable("projects", {
  id: text().primaryKey(),
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
});
export const projectRepos = pgTable(
  "project_repos",
  {
    id: uuid().defaultRandom().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    owner: text().notNull(),
    name: text().notNull(),
  },
  (t) => [unique().on(t.projectId, t.owner, t.name)],
);
export const projectItems = pgTable("project_items", {
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
});
export const inbox = pgTable("inbox", {
  id: uuid().defaultRandom().primaryKey(),
  text: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const repoSnapshots = pgTable(
  "repo_snapshots",
  {
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
  (t) => [primaryKey({ columns: [t.owner, t.name] })],
);
