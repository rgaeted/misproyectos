"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";

import type { BoardData, Project } from "@/lib/data";
import { stages, labels, colors, staleDays, type Stage } from "@/lib/stages";
import { mutate } from "@/lib/actions";
import type { CommandInput } from "@/lib/validation";
import type { TimeEntry } from "@/lib/time";
import { logout } from "@/lib/auth-actions";
import { stepLabels, stepSummary } from "@/lib/steps";
import { ProjectPanel } from "./ProjectPanel";
import { TodayList } from "./TodayList";
import { RunningClock } from "./RunningClock";
import { dragAccessibility } from "@/lib/drag-accessibility";

export type Run = (
  command: CommandInput,
) => Promise<{ ok: boolean; id?: string }>;
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context },
) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code))
    return;
  event.preventDefault();
  const columns = context.droppableContainers
    .getEnabled()
    .map((c) => ({ id: c.id, rect: context.droppableRects.get(c.id) }))
    .filter((c) => c.rect)
    .sort((a, b) => a.rect!.left - b.rect!.left);
  const current = columns.findIndex(
    (c) => c.id === (context.over?.id ?? context.active?.data.current?.stage),
  );
  const index =
    current + (["ArrowRight", "ArrowDown"].includes(event.code) ? 1 : -1);
  const target = columns[index]?.rect;
  if (target) return { x: target.left + 12, y: target.top + 60 };
};
export function Workspace({
  initial,
  selectedId,
  viewerName,
  ufToday,
  timeEntries,
}: {
  initial: BoardData;
  selectedId?: string;
  viewerName?: string;
  ufToday?: number | null;
  timeEntries?: TimeEntry[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const filter = search.get("etapa");
  const archived = search.get("archivados") === "1";
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [theme, setTheme] = useState("system");
  const [newProject, setNewProject] = useState(false);
  const inboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => setData(initial), [initial]);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme ?? "system");
    const shortcut = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement;
      if (
        event.key === "i" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !el.closest('input,textarea,select,[contenteditable="true"]') &&
        !selectedId
      ) {
        event.preventDefault();
        inboxRef.current?.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [selectedId]);
  const run: Run = useCallback(
    async (command) => {
      setPending((n) => n + 1);
      setError("");
      try {
        const result = await mutate(command);
        if (!result.ok) {
          setError(result.error);
          return { ok: false };
        }
        setMessage("Guardado");
        return result;
      } catch {
        setError("No hay conexión. Inténtalo de nuevo.");
        return { ok: false };
      } finally {
        setPending((n) => n - 1);
      }
    },
    [],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );
  const visible = data.projects.filter((p) => p.archived === archived);
  const selected = data.projects.find((p) => p.id === selectedId);
  const query = new URLSearchParams(search.toString());
  const boardUrl = `/${query.size ? `?${query}` : ""}`;
  function filterStage(stage: Stage | null) {
    const q = new URLSearchParams(search.toString());
    if (filter === (stage ?? "sin_etapa")) q.delete("etapa");
    else q.set("etapa", stage ?? "sin_etapa");
    router.push(`/?${q}`, { scroll: false });
  }
  async function drop(event: DragEndEvent) {
    if (!event.over) return;
    const stage =
      event.over.id === "sin_etapa" ? null : (event.over.id as Stage);
    const project = data.projects.find((p) => p.id === event.active.id);
    if (
      !project ||
      (!stages.includes(stage as Stage) && stage !== null) ||
      project.stage === stage
    )
      return;
    const previous = project.stage;
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === project.id ? { ...p, stage } : p,
      ),
    }));
    const result = await run({
      op: "update",
      id: project.id,
      patch: { stage },
    });
    if (!result.ok)
      setData((d) => ({
        ...d,
        projects: d.projects.map((p) =>
          p.id === project.id ? { ...p, stage: previous } : p,
        ),
      }));
  }
  const columns: (Stage | null)[] = [
    ...stages,
    ...(visible.some((p) => p.stage === null) ? [null] : []),
  ];
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            m<span>p</span>
          </span>{" "}
          Tu espacio de trabajo
        </Link>
        <div className="top-actions">
          <span className="owner">{viewerName || "Mi cuenta"}</span>
          <button
            className="icon-button"
            aria-label={`Cambiar tema: ${theme}`}
            onClick={() => {
              const next =
                theme === "dark"
                  ? "light"
                  : theme === "light"
                    ? "system"
                    : "dark";
              setTheme(next);
              if (next === "system")
                delete document.documentElement.dataset.theme;
              else document.documentElement.dataset.theme = next;
              document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
            }}
          >
            {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
          </button>
          <form action={logout}><button className="quiet">Salir</button></form>
        </div>
      </header>
      <main className="workspace">
        <div className="heading">
          <div>
            <p className="eyebrow">Un poco de perspectiva</p>
            <h1>
              Mis proyectos<span className="title-dot">.</span>
            </h1>
            <p className="subtitle">
              {visible.length} proyectos,{" "}
              {
                visible.filter(
                  (p) =>
                    p.stage === "en_desarrollo" || p.stage === "en_ejecucion",
                ).length
              }{" "}
              en movimiento
              <span className="subtitle-note">
                {" "}
                · Cada idea tiene su lugar.
              </span>
            </p>
          </div>
          <button className="primary" onClick={() => setNewProject(true)}>
            ＋ Nuevo proyecto
          </button>
        </div>
        <div className="section-caption">
          <span>De la idea a la acción</span>
          <span>Selecciona una etapa para filtrar</span>
        </div>
        <nav className="stage-bar" aria-label="Filtrar por etapa">
          {columns.map((stage) => {
            const count = visible.filter((p) => p.stage === stage).length;
            return (
              <button
                key={stage ?? "null"}
                aria-pressed={filter === (stage ?? "sin_etapa")}
                className="stage-segment"
                style={{
                  flexGrow: Math.max(count, 0.6),
                  borderTopColor: stage ? colors[stage] : "var(--muted)",
                }}
                onClick={() => filterStage(stage)}
              >
                <strong>{count}</strong>
                <span>{stage ? labels[stage] : "Sin etapa"}</span>
              </button>
            );
          })}
        </nav>
        <div className="board-toolbar">
          <div>
            <strong>Tablero</strong>
            <span className="muted">
              {" "}
              / {archived ? "Archivados" : "Todos tus proyectos"}
            </span>
          </div>
          <div className="toolbar-actions">
            <button onClick={() => router.push("/cierre")}>Cerrar el día</button>
            <button onClick={() => router.push("/pagos")}>Pagos</button>
            <button onClick={() => router.push("/tiempo")}>Tiempo</button>
            {filter && (
              <button
                onClick={() => router.push(archived ? "/?archivados=1" : "/")}
              >
                Quitar filtro ×
              </button>
            )}
            <button
              onClick={() => router.push(archived ? "/" : "/?archivados=1")}
            >
              {archived ? "Volver a activos" : "Ver archivados"}
            </button>
          </div>
        </div>
        {!archived && <TodayList dayList={data.dayList} run={run} pending={pending > 0} />}
        <DndContext
          sensors={sensors}
          onDragEnd={drop}
          accessibility={dragAccessibility}
        >
          <div className="board">
            {columns
              .filter((stage) => !filter || filter === (stage ?? "sin_etapa"))
              .map((stage) => (
                <Column
                  key={stage ?? "null"}
                  stage={stage}
                  projects={visible.filter((p) => p.stage === stage)}
                  open={(id) =>
                    router.push(`/p/${id}${query.size ? `?${query}` : ""}`, {
                      scroll: false,
                    })
                  }
                />
              ))}
          </div>
        </DndContext>
        {!archived && (
          <section className="inbox">
            <div className="inbox-heading">
              <div>
                <h2>
                  Bandeja de ideas{" "}
                  <span className="count">{data.inbox.length}</span>
                </h2>
                <p>Para eso que se te ocurrió y no quieres olvidar.</p>
              </div>
              <kbd>i</kbd>
            </div>
            <form
              className="capture"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = new FormData(form).get("text") as string;
                if ((await run({ op: "capture", text: input })).ok)
                  form.reset();
              }}
            >
              <span aria-hidden="true">＋</span>
              <input
                ref={inboxRef}
                name="text"
                required
                maxLength={2000}
                placeholder="Anota una idea, sin darle tantas vueltas…"
                aria-label="Nueva idea"
              />
              <button disabled={pending > 0}>Guardar idea ↵</button>
            </form>
            <div className="inbox-items">
              {data.inbox.map((idea) => (
                <div className="inbox-item" key={idea.id}>
                  <span className="idea-dot" />
                  <p>{idea.text}</p>
                  <button
                    disabled={pending > 0}
                    onClick={async () => {
                      const result = await run({ op: "convert", id: idea.id });
                      if (result.ok && result.id)
                        router.push(`/p/${result.id}`);
                    }}
                  >
                    Convertir en proyecto ↗
                  </button>
                  <button
                    aria-label={`Borrar idea: ${idea.text}`}
                    disabled={pending > 0}
                    onClick={() => run({ op: "removeInbox", id: idea.id })}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!data.inbox.length && (
                <p className="empty">
                  Bandeja vacía. Anota la primera idea arriba.
                </p>
              )}
            </div>
          </section>
        )}
        <footer className="footer">
          <span>Un paso a la vez también es avanzar.</span>
          <span>Mis proyectos · Hecho para enfocarte</span>
        </footer>
      </main>
      <div
        className={error ? "toast error" : "save-status"}
        role={error ? "alert" : "status"}
      >
        {error || (pending ? "Guardando…" : message)}
        {error && (
          <button onClick={() => setError("")} aria-label="Cerrar error">
            ×
          </button>
        )}
      </div>
      {newProject && (
        <div className="backdrop" onClick={() => setNewProject(false)}>
          <section
            className="new-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") setNewProject(false);
              if (e.key === "Tab") {
                const elements = e.currentTarget.querySelectorAll<HTMLElement>(
                  "input,button:not(:disabled)",
                );
                const first = elements[0],
                  last = elements[elements.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                }
                if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-title">Dale espacio a un proyecto</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get(
                  "name",
                ) as string;
                const result = await run({ op: "create", name });
                if (result.ok && result.id) {
                  setNewProject(false);
                  router.push(`/p/${result.id}`);
                }
              }}
            >
              <label>
                Nombre
                <input
                  name="name"
                  autoFocus
                  required
                  maxLength={120}
                  placeholder="¿Qué tienes en mente?"
                />
              </label>
              <div className="dialog-actions">
                <button type="button" onClick={() => setNewProject(false)}>
                  Cancelar
                </button>
                <button className="primary" disabled={pending > 0}>
                  Crear proyecto
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <ProjectPanel
          key={selected.id}
          project={selected}
          types={[...new Set(data.projects.map((p) => p.type))]}
          run={run}
          close={() => router.push(boardUrl, { scroll: false })}
          pending={pending > 0}
          ufToday={ufToday ?? null}
          timeEntries={timeEntries ?? []}
        />
      )}
    </>
  );
}
function Column({
  stage,
  projects,
  open,
}: {
  stage: Stage | null;
  projects: Project[];
  open: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage ?? "sin_etapa" });
  return (
    <section
      ref={setNodeRef}
      className={`column ${isOver ? "drop-over" : ""}`}
      style={
        {
          "--stage": stage ? colors[stage] : "var(--muted)",
        } as React.CSSProperties
      }
    >
      <h2>
        <span className="stage-dot" />
        {stage ? labels[stage] : "Sin etapa"}
        <span className="count">{projects.length}</span>
      </h2>
      <div className="column-body">
        {projects.map((p) => (
          <Card key={p.id} project={p} open={() => open(p.id)} />
        ))}
        {!projects.length && (
          <p className="column-empty">Arrastra un proyecto aquí</p>
        )}
      </div>
    </section>
  );
}
function Card({ project: p, open }: { project: Project; open: () => void }) {
  const steps = stepSummary(p.steps);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: p.id, data: { stage: p.stage ?? "sin_etapa" } });
  const quiet = staleDays(
    p.stage,
    p.repos.map((r) => r.snapshot?.lastCommitAt ?? null),
  );
  return (
    <article
      ref={setNodeRef}
      className={`project-card ${isDragging ? "dragging" : ""}`}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px,${transform.y}px,0)`
          : undefined,
      }}
    >
      <div className="card-top">
        <span className="project-type">{p.type || "Proyecto"}</span>
        <button
          {...attributes}
          {...listeners}
          className="drag-handle"
          aria-label={`Mover ${p.name}`}
        >
          ⠿
        </button>
      </div>
      {p.runningTimer && (
        <div className="card-clock" role="group" aria-label="Reloj corriendo">
          <span className="card-clock-dot" aria-hidden="true" />
          <RunningClock startedAt={p.runningTimer.startedAt} />
        </div>
      )}
      <button className="card-link" onClick={open}>
        <h3>{p.name}</h3>
        {steps.pending.length ? <span className="card-steps">
          {steps.pending.slice(0, 2).map((step) => <span className="card-step" key={step.id}>
            <span className={`step-badge ${step.state}`}>{stepLabels[step.state]}</span>
            <span className="card-step-text">{step.text}</span>
            {step.state === "waiting" && step.waitingOn && <span className="card-step-note">Espera: {step.waitingOn}</span>}
          </span>)}
          {steps.pending.length > 2 && <span className="more-steps">+{steps.pending.length - 2} pasos pendientes</span>}
        </span> : <p>{p.steps.length ? "Todos los pasos completados" : "Agrega los próximos pasos"}</p>}
      </button>
      {!!p.steps.length && <div className="card-step-counts"><span className={steps.todo > 0 ? "work-count" : undefined}>{steps.todo} por trabajar</span><span>{steps.waiting} en espera</span>{!!steps.done && <span>{steps.done} completados</span>}</div>}
      <div className="card-meta">
        <span title="Preguntas abiertas">
          ○ {p.items.filter((i) => i.kind === "question" && !i.done).length}
        </span>
        <span title="Ideas">
          ◇ {p.items.filter((i) => i.kind === "idea").length}
        </span>
        {p.repos.length > 0 && (
          <span title="Repositorios">⌘ {p.repos.length}</span>
        )}
        {!p.repos.length && <span className="no-repo">Sin repo</span>}
      </div>
      {quiet !== null && (
        <div className="stale">◷ Quieto hace {quiet} días</div>
      )}
    </article>
  );
}
