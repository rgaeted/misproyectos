"use client";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/data";
import type { Run } from "./Workspace";
import { RunningClock } from "./RunningClock";
import { todayInChile } from "@/lib/payments";
import { buildReport, chileLocalToIso, formatDuration, isoToChileLocal, validEntryRange, weekStart, type TimeEntry } from "@/lib/time";

const NO_TASK = "Sin tarea asignada";
const VISIBLE_ENTRIES = 10;

function taskName(entry: TimeEntry, steps: Project["steps"]) {
  return steps.find((step) => step.id === entry.stepId)?.text || entry.taskText || NO_TASK;
}

function shortDate(local: string) {
  const [, month, day] = local.slice(0, 10).split("-");
  return `${day}-${month}`;
}

export function TimeTracker({ project, entries, run, pending }: { project: Project; entries: TimeEntry[]; run: Run; pending: boolean }) {
  const running = project.runningTimer;
  const [now, setNow] = useState(() => Date.now());
  const [newTask, setNewTask] = useState("");
  const [clockError, setClockError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const today = todayInChile();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const finished = entries.filter((entry) => entry.endedAt !== null);
  const counted = running ? [...finished, running] : finished;
  const nowDate = new Date(now);
  const todayMinutes = buildReport(counted, project.steps, today, today, nowDate).totalMinutes;
  const weekMinutes = buildReport(counted, project.steps, weekStart(today), today, nowDate).totalMinutes;
  const openSteps = project.steps.filter((step) => step.state !== "done");
  const taskOptions = running?.stepId && !openSteps.some((step) => step.id === running.stepId)
    ? [...project.steps.filter((step) => step.id === running.stepId), ...openSteps]
    : openSteps;
  const invalidRange = !from || !to || from > to;
  const visibleEntries = showAll ? finished : finished.slice(0, VISIBLE_ENTRIES);

  async function clockAction(command: Parameters<Run>[0]) {
    setClockError("");
    const result = await run(command);
    if (!result.ok) setClockError("No se pudo guardar. Inténtalo de nuevo.");
    return result;
  }

  async function rowAction(id: string, command: Parameters<Run>[0]) {
    setRowErrors((errors) => ({ ...errors, [id]: "" }));
    const result = await run(command);
    if (!result.ok) setRowErrors((errors) => ({ ...errors, [id]: "No se pudo guardar. Revisa los datos e inténtalo de nuevo." }));
    return result.ok;
  }

  return <section className="panel-section time-tracker" aria-labelledby="time-title">
    <div className="section-title"><h3 id="time-title">Tiempo</h3></div>
    <div className="time-clock">
      {running ? <>
        <div className="time-clock-main">
          <RunningClock startedAt={running.startedAt} />
          <button type="button" className="primary" disabled={pending} aria-label="Detener el reloj" onClick={() => clockAction({ op: "stopTimer", projectId: project.id })}>Detener</button>
        </div>
        <label className="time-field">Tarea actual
          <select aria-label="Tarea del tramo en curso" value={running.stepId ?? ""} disabled={pending} onChange={(event) => {
            const stepId = event.target.value;
            if (!stepId || stepId === running.stepId) return;
            clockAction({ op: "setTimerTask", projectId: project.id, stepId });
          }}>
            {!running.stepId && <option value="">{running.taskText || NO_TASK}</option>}
            {taskOptions.map((step) => <option key={step.id} value={step.id}>{step.text}</option>)}
          </select>
        </label>
        <form className="time-new-task" onSubmit={async (event) => {
          event.preventDefault();
          const text = newTask.trim();
          if (!text) return;
          if ((await clockAction({ op: "setTimerTask", projectId: project.id, text })).ok) setNewTask("");
        }}>
          <input aria-label="Nueva tarea" placeholder="Nueva tarea" value={newTask} maxLength={2000} disabled={pending} onChange={(event) => setNewTask(event.target.value)} />
          <button disabled={pending || !newTask.trim()}>Asignar nueva tarea</button>
        </form>
      </> : project.archived
        ? <p className="steps-empty">Restaura el proyecto para iniciar el reloj.</p>
        : <button type="button" className="primary" disabled={pending} aria-label="Iniciar el reloj" onClick={() => clockAction({ op: "startTimer", projectId: project.id })}>Iniciar</button>}
      {clockError && <p className="time-error" role="alert">{clockError}</p>}
    </div>

    <p className="time-totals"><span suppressHydrationWarning>Hoy: <strong>{formatDuration(todayMinutes)}</strong></span><span suppressHydrationWarning>Esta semana: <strong>{formatDuration(weekMinutes)}</strong></span></p>

    <h4 className="time-subtitle">Tramos recientes <span className="count">{finished.length}</span></h4>
    <div className="steps-list">
      {visibleEntries.map((entry) => {
        const start = isoToChileLocal(entry.startedAt);
        const end = isoToChileLocal(entry.endedAt!);
        const minutes = Math.round((Date.parse(entry.endedAt!) - Date.parse(entry.startedAt)) / 60_000);
        const name = taskName(entry, project.steps);
        const currentStepId = project.steps.some((step) => step.id === entry.stepId) ? entry.stepId : null;
        return <div key={entry.id} className="step-row time-entry">
          {editingId === entry.id
            ? <EntryForm steps={project.steps} initialStart={start} initialEnd={end} initialStepId={currentStepId} submitLabel="Guardar cambios" pending={pending}
                submit={async (startedAt, endedAt, stepId) => {
                  const ok = await rowAction(entry.id, { op: "editTimeEntry", id: entry.id, startedAt, endedAt, ...(stepId === currentStepId ? {} : { stepId }) });
                  if (ok) setEditingId(null);
                  return ok;
                }}
                cancel={() => setEditingId(null)} />
            : <>
              <div className="time-entry-main">
                <span className="time-entry-when">{shortDate(start)} · {start.slice(11)}–{shortDate(end) !== shortDate(start) ? `${shortDate(end)} ` : ""}{end.slice(11)}</span>
                <strong className="time-entry-duration">{formatDuration(minutes)}</strong>
              </div>
              <p className="time-entry-task">{name}</p>
              <div className="time-entry-actions">
                <button type="button" disabled={pending} aria-label={`Editar tramo: ${name}, ${shortDate(start)} ${start.slice(11)}`} onClick={() => { setEditingId(entry.id); setAdding(false); }}>Editar</button>
                <button type="button" disabled={pending} aria-label={`Borrar tramo: ${name}, ${shortDate(start)} ${start.slice(11)}`} onClick={() => rowAction(entry.id, { op: "removeTimeEntry", id: entry.id })}>Borrar</button>
              </div>
            </>}
          {rowErrors[entry.id] && <p className="time-error" role="alert">{rowErrors[entry.id]}</p>}
        </div>;
      })}
    </div>
    {!finished.length && <p className="steps-empty">Todavía no hay tramos terminados en los últimos 30 días.</p>}
    {finished.length > VISIBLE_ENTRIES && <button type="button" className="time-more" onClick={() => setShowAll((value) => !value)}>{showAll ? "Ver menos" : `Ver los ${finished.length} tramos`}</button>}

    {adding
      ? <div className="time-add">
        <EntryForm steps={project.steps} initialStart={isoToChileLocal(new Date(Date.now() - 3_600_000).toISOString())} initialEnd={isoToChileLocal(new Date().toISOString())} initialStepId={null} submitLabel="Agregar tramo" pending={pending}
          submit={async (startedAt, endedAt, stepId) => {
            const ok = await rowAction("add", { op: "addTimeEntry", projectId: project.id, startedAt, endedAt, stepId });
            if (ok) setAdding(false);
            return ok;
          }}
          cancel={() => setAdding(false)} />
        {rowErrors.add && <p className="time-error" role="alert">{rowErrors.add}</p>}
      </div>
      : <button type="button" className="time-more" disabled={pending} onClick={() => { setAdding(true); setEditingId(null); setRowErrors((errors) => ({ ...errors, add: "" })); }}>Agregar tiempo a mano</button>}

    <h4 className="time-subtitle">Informe</h4>
    <div className="time-report">
      <label className="time-field">Desde<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="time-field">Hasta<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
    </div>
    {invalidRange
      ? <span className="time-download disabled" aria-disabled="true">Descargar informe PDF</span>
      : <a className="time-download" href={`/p/${project.id}/informe?desde=${from}&hasta=${to}`}>Descargar informe PDF</a>}
    {invalidRange && <p className="steps-empty">Elige fechas válidas: “Desde” no puede ser posterior a “Hasta”.</p>}
  </section>;
}

function EntryForm({ steps, initialStart, initialEnd, initialStepId, submitLabel, pending, submit, cancel }: {
  steps: Project["steps"]; initialStart: string; initialEnd: string; initialStepId: string | null; submitLabel: string; pending: boolean;
  submit: (startedAt: string, endedAt: string, stepId: string | null) => Promise<boolean>; cancel: () => void;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [stepId, setStepId] = useState(initialStepId ?? "");
  const [message, setMessage] = useState("");
  return <form className="time-entry-form" onSubmit={async (event) => {
    event.preventDefault();
    if (!start || !end) { setMessage("Completa el inicio y el fin."); return; }
    const startedAt = chileLocalToIso(start);
    const endedAt = chileLocalToIso(end);
    if (!validEntryRange(new Date(startedAt), new Date(endedAt), new Date())) { setMessage("El inicio debe ser anterior al fin, y el fin no puede estar en el futuro."); return; }
    setMessage("");
    await submit(startedAt, endedAt, stepId || null);
  }}>
    <label className="time-field">Inicio<input type="datetime-local" aria-label="Inicio del tramo" value={start} required onChange={(event) => setStart(event.target.value)} /></label>
    <label className="time-field">Fin<input type="datetime-local" aria-label="Fin del tramo" value={end} required onChange={(event) => setEnd(event.target.value)} /></label>
    <label className="time-field">Tarea
      <select aria-label="Tarea del tramo" value={stepId} onChange={(event) => setStepId(event.target.value)}>
        <option value="">{NO_TASK}</option>
        {steps.map((step) => <option key={step.id} value={step.id}>{step.text}</option>)}
      </select>
    </label>
    {message && <p className="time-error" role="alert">{message}</p>}
    <div className="time-entry-actions">
      <button type="button" onClick={cancel}>Cancelar</button>
      <button className="primary" disabled={pending}>{submitLabel}</button>
    </div>
  </form>;
}
