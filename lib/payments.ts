export const planKinds = ["once", "installments", "monthly"] as const;
export type PlanKind = (typeof planKinds)[number];
export const planKindLabels: Record<PlanKind, string> = {
  once: "Pago único",
  installments: "Cuotas",
  monthly: "Mensual",
};
export type PaymentPlan = {
  id: string; projectId: string; concept: string; kind: PlanKind; amountUf: number;
  startDate: string; installments: number | null; endDate: string | null; position: number;
};
export type PaidPayment = {
  id: string; planId: string; seq: number; dueDate: string; amountUf: number;
  paidOn: string; ufValue: number | null;
};
export type ScheduleEntry = { planId: string; seq: number; dueDate: string; amountUf: number };
export type PaymentRow = ScheduleEntry & {
  concept: string; status: "paid" | "pending" | "overdue"; paidOn: string | null; ufValue: number | null;
};
type OverviewRow = PaymentRow & { projectId: string; projectName: string };
type OverviewInput = { id: string; name: string; archived: boolean; plans: PaymentPlan[]; payments: PaidPayment[] };

const round2 = (value: number) => Math.round(value * 100) / 100;
const pad = (value: number) => String(value).padStart(2, "0");

export function todayInChile(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}

export function addMonths(startDate: string, months: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total % 12;
  const lastDay = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
  return `${newYear}-${pad(newMonth + 1)}-${pad(Math.min(day, lastDay))}`;
}

export function dueDateFor(plan: PaymentPlan, seq: number): string | null {
  if (!Number.isInteger(seq) || seq < 0) return null;
  if (plan.kind === "once") return seq === 0 ? plan.startDate : null;
  if (plan.kind === "installments") return seq < (plan.installments ?? 0) ? addMonths(plan.startDate, seq) : null;
  const date = addMonths(plan.startDate, seq);
  return plan.endDate && date > plan.endDate ? null : date;
}

export function planSchedule(plan: PaymentPlan, until: string): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (let seq = 0; ; seq++) {
    const dueDate = dueDateFor(plan, seq);
    if (dueDate === null || (plan.kind === "monthly" && dueDate > until)) break;
    entries.push({ planId: plan.id, seq, dueDate, amountUf: plan.amountUf });
  }
  return entries;
}

export function projectPayments(plans: PaymentPlan[], paid: PaidPayment[], today: string) {
  const ordered = [...plans].sort((a, b) => a.position - b.position);
  const conceptOf = (planId: string) => plans.find((plan) => plan.id === planId)?.concept ?? "";
  const paidKeys = new Set(paid.map((payment) => `${payment.planId}:${payment.seq}`));
  const paidRows: PaymentRow[] = paid
    .map((payment) => ({
      planId: payment.planId, seq: payment.seq, dueDate: payment.dueDate, amountUf: payment.amountUf,
      concept: conceptOf(payment.planId), status: "paid" as const, paidOn: payment.paidOn, ufValue: payment.ufValue,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const horizon = addMonths(today, 12);
  const upcoming: PaymentRow[] = ordered
    .flatMap((plan) => planSchedule(plan, horizon).map((entry) => ({ ...entry, concept: plan.concept })))
    .filter((entry) => !paidKeys.has(`${entry.planId}:${entry.seq}`))
    .map((entry) => ({
      ...entry, status: entry.dueDate < today ? ("overdue" as const) : ("pending" as const), paidOn: null, ufValue: null,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { paid: paidRows, upcoming, totalPaidUf: round2(paidRows.reduce((sum, row) => sum + row.amountUf, 0)) };
}

export function paymentsOverview(projects: OverviewInput[], today: string) {
  const month = today.slice(0, 7);
  const nextMonth = addMonths(`${month}-01`, 1).slice(0, 7);
  const year = today.slice(0, 4);
  const group = (rows: OverviewRow[]) => ({ totalUf: round2(rows.reduce((sum, row) => sum + row.amountUf, 0)), rows });
  const overdue: OverviewRow[] = [];
  const thisMonth: OverviewRow[] = [];
  const next: OverviewRow[] = [];
  let collectedUf = 0;
  let collectedClp = 0;
  let clpComplete = true;
  for (const project of projects) {
    const result = projectPayments(project.plans, project.payments, today);
    for (const row of result.paid) {
      if (!row.paidOn?.startsWith(year)) continue;
      collectedUf += row.amountUf;
      if (row.ufValue === null) clpComplete = false;
      else collectedClp += ufToClp(row.amountUf, row.ufValue);
    }
    if (project.archived) continue;
    for (const row of result.upcoming) {
      const tagged = { ...row, projectId: project.id, projectName: project.name };
      if (row.status === "overdue") overdue.push(tagged);
      else if (row.dueDate.startsWith(month)) thisMonth.push(tagged);
      else if (row.dueDate.startsWith(nextMonth)) next.push(tagged);
    }
  }
  return {
    thisMonth: group(thisMonth), nextMonth: group(next), overdue: group(overdue),
    collectedYear: { uf: round2(collectedUf), clp: collectedClp, clpComplete },
  };
}

export function displayDate(date: string): string {
  return `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`;
}

export function paidOnFor(dueDate: string, today: string): string {
  return dueDate < today ? dueDate : today;
}

function grouped(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
export function formatUf(value: number): string {
  const [whole, decimals] = value.toFixed(2).split(".");
  return `${grouped(whole)},${decimals} UF`;
}
export function formatClp(value: number): string {
  return `$ ${grouped(String(Math.round(value)))}`;
}
export function ufToClp(uf: number, ufValue: number): number {
  return Math.round(uf * ufValue);
}
