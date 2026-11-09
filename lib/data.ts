import "server-only";
import { unstable_cache } from "next/cache";
import { asc, eq, getTableColumns } from "drizzle-orm";
import { withUserDatabase } from "./db";
import { isUserId } from "./access";
import { boardTag } from "./board-cache";
import {
  projects,
  projectItems,
  projectSteps,
  paymentPlans,
  payments,
  dayLists,
  dayListItems,
  projectRepos,
  repoSnapshots,
  inbox,
} from "./db/schema";
function cachedBoard(userId: string) {
  return unstable_cache(() => readBoard(userId), ["misproyectos-board-v5", userId], {
    revalidate: 30,
    tags: [boardTag(userId)],
  })();
}
export async function getBoard(userId: string) {
  if (!isUserId(userId)) throw new Error("invalid_user");
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      cachedBoard(userId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("La carga del tablero excedió 15 segundos.")),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    console.info("board_load", {
      durationMs: Math.round(performance.now() - started),
    });
  }
}
async function readBoard(userId: string) {
  const started = performance.now();
  console.info("board_database_start");
  return withUserDatabase(userId, async (db) => {
  const p = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(asc(projects.sortOrder), asc(projects.createdAt));
  const i = await db.select(getTableColumns(projectItems)).from(projectItems)
      .innerJoin(projects, eq(projectItems.projectId, projects.id))
      .where(eq(projects.userId, userId)).orderBy(asc(projectItems.position));
  const r = await db.select(getTableColumns(projectRepos)).from(projectRepos)
      .innerJoin(projects, eq(projectRepos.projectId, projects.id))
      .where(eq(projects.userId, userId));
  const s = await db
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
      .from(repoSnapshots).where(eq(repoSnapshots.userId, userId));
  const b = await db.select().from(inbox).where(eq(inbox.userId, userId)).orderBy(asc(inbox.createdAt));
  const steps = await db.select(getTableColumns(projectSteps)).from(projectSteps)
    .innerJoin(projects, eq(projectSteps.projectId, projects.id))
    .where(eq(projects.userId, userId)).orderBy(asc(projectSteps.position), asc(projectSteps.createdAt), asc(projectSteps.id));
  const plans = await db.select(getTableColumns(paymentPlans)).from(paymentPlans)
    .innerJoin(projects, eq(paymentPlans.projectId, projects.id))
    .where(eq(projects.userId, userId)).orderBy(asc(paymentPlans.position), asc(paymentPlans.createdAt));
  const paid = await db.select(getTableColumns(payments)).from(payments)
    .innerJoin(paymentPlans, eq(payments.planId, paymentPlans.id))
    .innerJoin(projects, eq(paymentPlans.projectId, projects.id))
    .where(eq(projects.userId, userId)).orderBy(asc(payments.dueDate));
  const [dl] = await db.select().from(dayLists).where(eq(dayLists.userId, userId));
  const dItems = dl ? await db.select().from(dayListItems).where(eq(dayListItems.userId, userId)).orderBy(asc(dayListItems.position)) : [];
  const dayList = dl ? {
    confirmedAt: dl.confirmedAt,
    items: dItems.map((item) => {
      const step = item.stepId ? steps.find((s) => s.id === item.stepId) : undefined;
      const project = step ? p.find((x) => x.id === step.projectId) : undefined;
      return step && project
        ? { id: item.id, stepId: step.id, projectId: project.id, projectName: project.name, text: step.text, done: step.state === "done", doneAt: step.completedAt }
        : { id: item.id, stepId: null, projectId: null, projectName: null, text: item.text, done: item.done, doneAt: item.doneAt };
    }),
  } : null;
  console.info("board_database_complete", {
    durationMs: Math.round(performance.now() - started),
  });
  return JSON.parse(
    JSON.stringify({
      projects: p.map((project) => ({
        ...project,
        steps: steps.filter((step) => step.projectId === project.id),
        plans: plans.filter((plan) => plan.projectId === project.id),
        payments: paid.filter((payment) => plans.some((plan) => plan.id === payment.planId && plan.projectId === project.id)),
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
      dayList,
    }),
  ) as BoardData;
  });
}
export type Item = {
  id: string;
  projectId: string;
  kind: "status" | "idea" | "question";
  text: string;
  done: boolean;
  position: number;
};
export type Step = {
  id: string;
  projectId: string;
  text: string;
  state: import("./steps").StepState;
  waitingOn: string;
  completedAt: string | null;
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
  steps: Step[];
  plans: import("./payments").PaymentPlan[];
  payments: import("./payments").PaidPayment[];
  repos: Repo[];
};
export type BoardData = {
  projects: Project[];
  inbox: { id: string; text: string; createdAt: string }[];
  dayList: import("./day").DayList | null;
};
