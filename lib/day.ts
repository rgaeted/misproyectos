import type { Project } from "./data";
import { displayDate, formatUf, projectPayments, todayInChile } from "./payments";

export type DayItem = {
  id: string; stepId: string | null; projectId: string | null; projectName: string | null;
  text: string; done: boolean; doneAt: string | null;
};
export type DayList = { confirmedAt: string; items: DayItem[] };
export type DraftItem =
  | { key: string; kind: "step"; stepId: string; projectName: string; text: string }
  | { key: string; kind: "text"; text: string };
export type DaySummary = {
  groups: { projectId: string; projectName: string; steps: string[]; payments: string[] }[];
  freeItems: string[];
  empty: boolean;
};

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function chileDate(iso: string): string {
  return todayInChile(new Date(iso));
}

export function daySummary(projects: Project[], dayList: DayList | null, today: string): DaySummary {
  const groups: DaySummary["groups"] = [];
  for (const project of projects) {
    const steps = project.steps
      .filter((step) => step.state === "done" && step.completedAt && chileDate(step.completedAt) === today)
      .map((step) => step.text);
    const payments = project.payments
      .filter((payment) => payment.createdAt && chileDate(payment.createdAt) === today)
      .map((payment) => `${project.plans.find((plan) => plan.id === payment.planId)?.concept ?? ""} · ${formatUf(payment.amountUf)}`);
    if (steps.length || payments.length) groups.push({ projectId: project.id, projectName: project.name, steps, payments });
  }
  const freeItems = (dayList?.items ?? [])
    .filter((item) => item.stepId === null && item.done && item.doneAt && chileDate(item.doneAt) === today)
    .map((item) => item.text);
  return { groups, freeItems, empty: groups.length === 0 && freeItems.length === 0 };
}

export function draftForTomorrow(projects: Project[], dayList: DayList | null, today: string): DraftItem[] {
  const draft: DraftItem[] = [];
  const keys = new Set<string>();
  const add = (item: DraftItem) => {
    if (keys.has(item.key)) return;
    keys.add(item.key);
    draft.push(item);
  };
  for (const item of dayList?.items ?? []) {
    if (item.done) continue;
    if (item.stepId) add({ key: `step:${item.stepId}`, kind: "step", stepId: item.stepId, projectName: item.projectName ?? "", text: item.text });
    else add({ key: `text:${item.text}`, kind: "text", text: item.text });
  }
  const active = projects.filter((project) => !project.archived);
  for (const project of active) {
    const first = project.steps.find((step) => step.state === "todo");
    if (first) add({ key: `step:${first.id}`, kind: "step", stepId: first.id, projectName: project.name, text: first.text });
  }
  const tomorrow = addDays(today, 1);
  for (const project of active) {
    for (const row of projectPayments(project.plans, project.payments, today).upcoming) {
      if (row.status !== "overdue" && row.dueDate !== tomorrow) continue;
      const when = row.status === "overdue" ? `atrasado, venció ${displayDate(row.dueDate)}` : `vence ${displayDate(row.dueDate)}`;
      const text = `Cobrar ${project.name} · ${row.concept} ${formatUf(row.amountUf)} (${when})`;
      add({ key: `text:${text}`, kind: "text", text });
    }
  }
  return draft;
}
