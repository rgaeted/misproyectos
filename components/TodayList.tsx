"use client";
import type { DayList } from "@/lib/day";
import { displayDate, todayInChile } from "@/lib/payments";
import type { Run } from "./Workspace";

export function TodayList({ dayList, run, pending }: { dayList: DayList | null; run: Run; pending: boolean }) {
  if (!dayList) return null;
  const confirmed = new Date(dayList.confirmedAt);
  const weekday = new Intl.DateTimeFormat("es-CL", { weekday: "long", timeZone: "America/Santiago" }).format(confirmed);
  const shortDate = displayDate(todayInChile(confirmed)).slice(0, 5);
  return <section className="today-list" aria-labelledby="today-title">
    <h2 id="today-title">Hoy</h2>
    <p className="muted">Lista del cierre del {weekday} {shortDate}</p>
    {dayList.items.length === 0 ? <p className="muted">La lista quedó vacía.</p> : <ul className="today-items">
      {dayList.items.map((item) => <li key={item.id} className={item.done ? "done" : undefined}>
        <label>
          <input type="checkbox" checked={item.done} disabled={pending}
            onChange={(event) => run({ op: "toggleDayItem", id: item.id, done: event.target.checked })} />
          <span>{item.projectName && <strong>{item.projectName} · </strong>}{item.text}</span>
        </label>
      </li>)}
    </ul>}
  </section>;
}
