import Link from "next/link";
import { requireUser } from "@/lib/session";
import { addDays } from "@/lib/day";
import { todayInChile } from "@/lib/payments";
import { buildOverview, formatDuration, formatHoursDecimal, startOfChileDay, weekStart } from "@/lib/time";
import { getTimeOverviewData } from "@/lib/time-data";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mes" },
  { key: "todo", label: "Todo" },
] as const;

export default async function TimePage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const user = await requireUser();
  const { periodo } = await searchParams;
  const period = PERIODS.find((p) => p.key === periodo)?.key ?? "mes";
  const today = todayInChile();
  const from = period === "semana" ? weekStart(today) : period === "mes" ? `${today.slice(0, 8)}01` : "2000-01-01";
  const data = await getTimeOverviewData(user.id!, startOfChileDay(from), startOfChileDay(addDays(today, 1)));
  const overview = buildOverview(data.projects, data.entries, data.steps, from, today, new Date());
  return <main className="payments-page">
    <header className="payments-page-header">
      <Link href="/">← Volver al tablero</Link>
      <h1>Tiempo</h1>
      <nav className="time-periods" aria-label="Período">
        {PERIODS.map((p) => <Link key={p.key} href={`/tiempo?periodo=${p.key}`} aria-current={p.key === period ? "page" : undefined} className={p.key === period ? "active" : undefined}>{p.label}</Link>)}
      </nav>
      <p className="muted">Total: <strong>{formatDuration(overview.totalMinutes)}</strong> ({formatHoursDecimal(overview.totalMinutes)})</p>
    </header>
    {overview.groups.length === 0 ? <p className="muted">No hay tiempo registrado en este período.</p> : overview.groups.map((group) => <section key={group.projectId} className="payments-group">
      <h2><Link href={`/p/${group.projectId}`}>{group.name}</Link>{group.archived && <span className="muted"> (archivado)</span>} · {formatDuration(group.totalMinutes)}</h2>
      <ul className="payment-list">
        {group.tasks.map((task) => <li key={task.taskKey} className="payment-row time-overview-row">
          <span className="payment-concept">{task.task}</span>
          <span className="payment-amount">{formatDuration(task.minutes)}</span>
        </li>)}
      </ul>
    </section>)}
  </main>;
}
