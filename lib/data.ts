import "server-only";
import { asc } from "drizzle-orm";
import { database } from "./db";
import {
  projects,
  projectItems,
  projectRepos,
  repoSnapshots,
  inbox,
} from "./db/schema";
export async function getBoard() {
  const db = database();
  const [p, i, r, s, b] = await Promise.all([
    db
      .select()
      .from(projects)
      .orderBy(asc(projects.sortOrder), asc(projects.createdAt)),
    db.select().from(projectItems).orderBy(asc(projectItems.position)),
    db.select().from(projectRepos),
    db
      .select({
        owner: repoSnapshots.owner,
        name: repoSnapshots.name,
        lastCommitAt: repoSnapshots.lastCommitAt,
        lastCommitMsg: repoSnapshots.lastCommitMsg,
        openIssues: repoSnapshots.openIssues,
        openPrs: repoSnapshots.openPrs,
        commits7d: repoSnapshots.commits7d,
        fetchedAt: repoSnapshots.fetchedAt,
        error: repoSnapshots.error,
      })
      .from(repoSnapshots),
    db.select().from(inbox).orderBy(asc(inbox.createdAt)),
  ]);
  return JSON.parse(
    JSON.stringify({
      projects: p.map((project) => ({
        ...project,
        items: i.filter((item) => item.projectId === project.id),
        repos: r
          .filter((repo) => repo.projectId === project.id)
          .map((repo) => ({
            ...repo,
            snapshot:
              s.find(
                (snap) => snap.owner === repo.owner && snap.name === repo.name,
              ) ?? null,
          })),
      })),
      inbox: b,
    }),
  ) as BoardData;
}
export type Item = {
  id: string;
  projectId: string;
  kind: "status" | "idea" | "question";
  text: string;
  done: boolean;
  position: number;
};
export type Snapshot = {
  lastCommitAt: string | null;
  lastCommitMsg: string | null;
  openIssues: number | null;
  openPrs: number | null;
  commits7d: number | null;
  fetchedAt: string | null;
  error: string | null;
};
export type Repo = {
  id: string;
  owner: string;
  name: string;
  snapshot: Snapshot | null;
};
export type Project = {
  id: string;
  name: string;
  type: string;
  stage: import("./stages").Stage | null;
  lastUpdate: string;
  nextStep: string;
  noRepoNote: string | null;
  externalUrl: string | null;
  archived: boolean;
  items: Item[];
  repos: Repo[];
};
export type BoardData = {
  projects: Project[];
  inbox: { id: string; text: string; createdAt: string }[];
};
