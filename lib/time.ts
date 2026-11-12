import { addDays, chileDate } from "./day";

export type TimeEntry = {
  id: string;
  projectId: string;
  stepId: string | null;
  taskText: string;
  startedAt: string;
  endedAt: string | null;
};

export const MIN_ENTRY_MS = 60_000;
const HOUR_MS = 3_600_000;
const NO_TASK = "Sin tarea asignada";

export function startOfChileDay(date: string): Date {
  const base = new Date(`${date}T00:00:00.000Z`).getTime();
  for (let hour = 0; hour <= 6; hour++) {
    const candidate = new Date(base + hour * HOUR_MS);
    if (chileDate(candidate.toISOString()) === date) return candidate;
  }
  throw new Error(`No se encontró el inicio del día ${date} en Chile`);
}

const localFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isoToChileLocal(iso: string): string {
  const parts = Object.fromEntries(localFormat.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function chileLocalToIso(local: string): string {
  const candidates = ["-03:00", "-04:00"].map((offset) => new Date(`${local}:00${offset}`).toISOString());
  // Si ninguno coincide (hora saltada en septiembre), se usa −04:00, el offset vigente antes del salto.
  return candidates.find((iso) => isoToChileLocal(iso) === local) ?? candidates[1];
}

export function weekStart(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

type RunningEntry = Pick<TimeEntry, "startedAt" | "stepId" | "taskText">;

function elapsedMs(running: RunningEntry, now: Date): number {
  return now.getTime() - new Date(running.startedAt).getTime();
}

export function taskChangeFor(running: RunningEntry, now: Date): "assign" | "replace" | "split" {
  if (running.stepId === null && running.taskText === "") return "assign";
  return elapsedMs(running, now) < MIN_ENTRY_MS ? "replace" : "split";
}

export function stopActionFor(running: RunningEntry, now: Date): "close" | "discard" {
  return elapsedMs(running, now) < MIN_ENTRY_MS ? "discard" : "close";
}

export function validEntryRange(startedAt: Date, endedAt: Date, now: Date): boolean {
  return startedAt.getTime() < endedAt.getTime() && endedAt.getTime() <= now.getTime();
}

export type ReportTaskRow = { taskKey: string; task: string; minutes: number };
export type ReportDayRow = ReportTaskRow & { date: string };
export type Report = { byTask: ReportTaskRow[]; byDay: ReportDayRow[]; totalMinutes: number };

function taskFor(entry: TimeEntry, steps: Map<string, string>): { taskKey: string; task: string } {
  if (entry.stepId !== null && steps.has(entry.stepId)) return { taskKey: `step:${entry.stepId}`, task: steps.get(entry.stepId)! };
  if (entry.taskText !== "") return { taskKey: `text:${entry.taskText}`, task: entry.taskText };
  return { taskKey: "none", task: NO_TASK };
}

export function buildReport(entries: TimeEntry[], steps: { id: string; text: string }[], from: string, to: string, now: Date): Report {
  const periodStart = startOfChileDay(from).getTime();
  const periodEnd = startOfChileDay(addDays(to, 1)).getTime();
  const stepTexts = new Map(steps.map((step) => [step.id, step.text]));
  const cells = new Map<string, ReportDayRow & { ms: number }>();

  for (const entry of entries) {
    let start = Math.max(new Date(entry.startedAt).getTime(), periodStart);
    const end = Math.min(entry.endedAt === null ? now.getTime() : new Date(entry.endedAt).getTime(), periodEnd);
    const { taskKey, task } = taskFor(entry, stepTexts);
    while (start < end) {
      const date = chileDate(new Date(start).toISOString());
      const sliceEnd = Math.min(end, startOfChileDay(addDays(date, 1)).getTime());
      const key = `${date}|${taskKey}`;
      const cell = cells.get(key) ?? { date, taskKey, task, minutes: 0, ms: 0 };
      cell.ms += sliceEnd - start;
      cells.set(key, cell);
      start = sliceEnd;
    }
  }

  const byDay: ReportDayRow[] = [];
  for (const { ms, ...cell } of cells.values()) {
    const minutes = Math.round(ms / 60_000);
    if (minutes > 0) byDay.push({ ...cell, minutes });
  }
  byDay.sort((a, b) => a.date.localeCompare(b.date) || a.task.localeCompare(b.task, "es"));

  const tasks = new Map<string, ReportTaskRow>();
  for (const row of byDay) {
    const total = tasks.get(row.taskKey) ?? { taskKey: row.taskKey, task: row.task, minutes: 0 };
    total.minutes += row.minutes;
    tasks.set(row.taskKey, total);
  }
  const byTask = [...tasks.values()].sort(
    (a, b) => Number(a.taskKey === "none") - Number(b.taskKey === "none") || b.minutes - a.minutes,
  );
  const totalMinutes = byDay.reduce((sum, row) => sum + row.minutes, 0);
  return { byTask, byDay, totalMinutes };
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatHoursDecimal(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${String(hours).replace(".", ",")} h`;
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
}
