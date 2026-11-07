import Link from "next/link";
import { displayDate, formatClp, formatUf, ufToClp, type paymentsOverview } from "@/lib/payments";

type Overview = ReturnType<typeof paymentsOverview>;
type Group = Overview["overdue"];

export function PaymentsOverview({ overview, ufToday, year }: { overview: Overview; ufToday: number | null; year: string }) {
  const pesos = (uf: number) => (ufToday ? ` ≈ ${formatClp(ufToClp(uf, ufToday))}` : "");
  const { collectedYear } = overview;
  const sections: { title: string; group: Group; tone?: string }[] = [
    { title: "Atrasado", group: overview.overdue, tone: "overdue" },
    { title: "Por cobrar este mes", group: overview.thisMonth },
    { title: "Por cobrar el próximo mes", group: overview.nextMonth },
  ];
  return <main className="payments-page">
    <header className="payments-page-header">
      <Link href="/">← Volver al tablero</Link>
      <h1>Pagos</h1>
      <p className="muted">{ufToday ? `UF hoy: ${formatClp(ufToday)}` : "Sin valor UF disponible; se muestran solo UF."}</p>
    </header>
    <div className="payments-cards">
      {sections.map(({ title, group, tone }) => <section key={title} className={`payments-card ${tone ?? ""}`}>
        <h2>{title}</h2>
        <strong>{formatUf(group.totalUf)}</strong>
        <span className="muted">{pesos(group.totalUf).replace(" ≈", "≈")}</span>
      </section>)}
      <section className="payments-card">
        <h2>Cobrado en {year}</h2>
        <strong>{formatUf(collectedYear.uf)}</strong>
        <span className="muted">{formatClp(collectedYear.clp)}{collectedYear.clpComplete ? "" : " · algunos pagos sin valor en pesos"}</span>
      </section>
    </div>
    {sections.map(({ title, group }) => <section key={title} className="payments-group">
      <h2>{title}</h2>
      {group.rows.length === 0 ? <p className="muted">Nada por aquí.</p> : <ul className="payment-list">
        {group.rows.map((row) => <li key={`${row.planId}:${row.seq}`} className={`payment-row ${row.status}`}>
          <span className="payment-date">{displayDate(row.dueDate)}</span>
          <span className="payment-concept"><Link href={`/p/${row.projectId}`}>{row.projectName}</Link> · {row.concept}</span>
          <span className="payment-amount">{formatUf(row.amountUf)}</span>
        </li>)}
      </ul>}
    </section>)}
  </main>;
}
