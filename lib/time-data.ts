import "server-only";
import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { withUserDatabase } from "./db";
import { isUserId } from "./access";
import { projects, projectSteps, timeEntries } from "./db/schema";
import type { TimeEntry } from "./time";

// Tramos que se solapan con [from, to): started_at < to y (ended_at is null o ended_at > from).
export async function getTimeEntries(userId: string, projectId: string, from: Date, to: Date): Promise<TimeEntry[]> {
  if (!isUserId(userId)) throw new Error("invalid_user");
  return withUserDatabase(userId, async (db) => {
    const rows = await db
      .select({
        id: timeEntries.id,
        projectId: timeEntries.projectId,
        stepId: timeEntries.stepId,
        taskText: timeEntries.taskText,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
      })
      .from(timeEntries)
      .innerJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(and(
        eq(projects.userId, userId),
        eq(timeEntries.projectId, projectId),
        lt(timeEntries.startedAt, to),
        or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, from)),
      ))
      .orderBy(desc(timeEntries.startedAt));
    return rows.map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    }));
  });
}

// Todos los tramos del usuario (de todos sus proyectos, archivados incluidos) que se solapan con [from, to).
export async function getTimeOverviewData(userId: string, from: Date, to: Date) {
  if (!isUserId(userId)) throw new Error("invalid_user");
  return withUserDatabase(userId, async (db) => {
    const projectRows = await db
      .select({ id: projects.id, name: projects.name, archived: projects.archived })
      .from(projects)
      .where(eq(projects.userId, userId));
    const stepRows = await db
      .select({ id: projectSteps.id, text: projectSteps.text })
      .from(projectSteps)
      .innerJoin(projects, eq(projectSteps.projectId, projects.id))
      .where(eq(projects.userId, userId));
    const rows = await db
      .select({
        id: timeEntries.id,
        projectId: timeEntries.projectId,
        stepId: timeEntries.stepId,
        taskText: timeEntries.taskText,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
      })
      .from(timeEntries)
      .innerJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(and(
        eq(projects.userId, userId),
        lt(timeEntries.startedAt, to),
        or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, from)),
      ));
    const entries: TimeEntry[] = rows.map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    }));
    return { projects: projectRows, steps: stepRows, entries };
  });
}
