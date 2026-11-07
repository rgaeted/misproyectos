"use client";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project, Item } from "@/lib/data";
import { stages, labels, type Stage } from "@/lib/stages";
import type { Run } from "./Workspace";
import { dragAccessibility } from "@/lib/drag-accessibility";
import { NextSteps } from "./NextSteps";
import { Payments } from "./Payments";
export function ProjectPanel({
  project: p,
  types,
  run,
  close,
  pending,
  ufToday,
}: {
  project: Project;
  types: string[];
  run: Run;
  close: () => void;
  pending: boolean;
  ufToday: number | null;
}) {
  const panel = useRef<HTMLElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    panel.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, []);
  const patch = (value: Parameters<Run>[0] & { op: "update" }) => run(value);
  function keydown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
    if (e.key === "Tab") {
      const els = panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]',
      );
      if (!els?.length) return;
      const first = els[0],
        last = els[els.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  return (
    <div className="backdrop" onClick={close}>
      <aside
        ref={panel}
        tabIndex={-1}
        className="project-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        onKeyDown={keydown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-toolbar">
          <span>
            Tu proyecto /{" "}
            {p.archived ? "Archivado" : p.stage ? labels[p.stage] : "Sin etapa"}
          </span>
          <button onClick={close} aria-label="Cerrar ficha">
            Cerrar ×
          </button>
        </div>
        <div className="panel-content">
          <h2 id="panel-title" className="sr-only">
            Editar {p.name}
          </h2>
          <Editable
            key={`${p.id}-name`}
            value={p.name}
            label="Nombre del proyecto"
            max={120}
            className="project-name"
            save={(value) =>
              patch({ op: "update", id: p.id, patch: { name: value } })
            }
          />
          <div className="project-properties">
            <label>
              Tipo
              <Editable
                value={p.type}
                label="Tipo de proyecto"
                max={120}
                list="project-types"
                save={(value) =>
                  patch({ op: "update", id: p.id, patch: { type: value } })
                }
              />
              <datalist id="project-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label>
              Etapa
              <select
                value={p.stage ?? ""}
                onChange={(e) =>
                  run({
                    op: "update",
                    id: p.id,
                    patch: { stage: (e.target.value as Stage) || null },
                  })
                }
              >
                <option value="">Sin etapa</option>
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <section className="panel-section">
            <h3>Lo último</h3>
            <Editable
              multiline
              value={p.lastUpdate}
              label="Lo último"
              save={(value) =>
                run({ op: "update", id: p.id, patch: { lastUpdate: value } })
              }
            />
          </section>
          <NextSteps projectId={p.id} steps={p.steps} run={run} pending={pending} />
          <Payments projectId={p.id} plans={p.plans} payments={p.payments} ufToday={ufToday} run={run} pending={pending} />
          {(["status", "idea", "question"] as const).map((kind) => (
            <EditableList
              key={kind}
              project={p}
              kind={kind}
              run={run}
              pending={pending}
            />
          ))}
          <section className="panel-section">
            <div className="section-title">
              <h3>Repositorios</h3>
              <button
                disabled={pending || !p.repos.length}
                onClick={() => run({ op: "refresh", projectId: p.id })}
              >
                ↻ Actualizar
              </button>
            </div>
            {p.repos.map((repo) => (
              <div className="repo" key={repo.id}>
                <div className="section-title">
                  <a
                    href={`https://github.com/${repo.owner}/${repo.name}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {repo.owner}/{repo.name} ↗
                  </a>
                  <button
                    disabled={pending}
                    aria-label={`Quitar ${repo.name}`}
                    onClick={() => run({ op: "removeRepo", id: repo.id })}
                  >
                    ×
                  </button>
                </div>
                {repo.snapshot?.error ? (
                  <p className="repo-error">
                    {["not_found", "forbidden"].includes(repo.snapshot.error)
                      ? "Repo no accesible. Revisa el enlace y los permisos del token."
                      : "No se pudo actualizar. Inténtalo de nuevo."}
                  </p>
                ) : repo.snapshot ? (
                  <>
                    <p>
                      {repo.snapshot.lastCommitMsg?.split("\n")[0] ??
                        "Sin commits todavía"}
                    </p>
                    <div className="repo-stats">
                      <span>
                        {repo.snapshot.lastCommitAt
                          ? new Date(
                              repo.snapshot.lastCommitAt,
                            ).toLocaleDateString("es-CL")
                          : "Sin fecha"}
                      </span>
                      <span>{repo.snapshot.openIssues ?? 0} issues</span>
                      <span>{repo.snapshot.openPrs ?? 0} PRs</span>
                      <span>
                        {repo.snapshot.commits7d ?? 0} commits / 7 días
                      </span>
                    </div>
                  </>
                ) : (
                  <p>Presiona Actualizar para consultar GitHub.</p>
                )}
                {repo.snapshot?.fetchedAt && (
                  <small>
                    Última consulta:{" "}
                    {new Date(repo.snapshot.fetchedAt).toLocaleString("es-CL")}
                  </small>
                )}
              </div>
            ))}
            <AddForm
              label="URL de GitHub"
              placeholder="https://github.com/owner/repo"
              button="Agregar repo"
              pending={pending}
              submit={(url) => run({ op: "addRepo", projectId: p.id, url })}
            />
            {!p.repos.length && (
              <div className="no-repo-fields">
                <label>
                  Sin repo
                  <Editable
                    value={p.noRepoNote ?? ""}
                    label="Nota sin repositorio"
                    save={(value) =>
                      run({
                        op: "update",
                        id: p.id,
                        patch: { noRepoNote: value },
                      })
                    }
                  />
                </label>
                <label>
                  Enlace externo
                  <Editable
                    value={p.externalUrl ?? ""}
                    label="Enlace externo"
                    save={(value) =>
                      run({
                        op: "update",
                        id: p.id,
                        patch: { externalUrl: value },
                      })
                    }
                  />
                </label>
                {p.externalUrl && (
                  <a href={p.externalUrl} target="_blank" rel="noreferrer">
                    Abrir enlace externo ↗
                  </a>
                )}
              </div>
            )}
          </section>
          <div className="panel-bottom">
            <button
              disabled={pending}
              onClick={async () => {
                if (
                  (
                    await run({
                      op: "update",
                      id: p.id,
                      patch: { archived: !p.archived },
                    })
                  ).ok
                )
                  close();
              }}
            >
              {p.archived ? "Restaurar proyecto" : "Archivar proyecto"}
            </button>
            {p.archived && (
              <button className="danger" onClick={() => setConfirm(true)}>
                Eliminar proyecto
              </button>
            )}
          </div>
          {confirm && (
            <div className="delete-confirm" role="alert">
              <p>
                ¿Eliminar este proyecto y todos sus ítems? Esta acción es
                permanente.
              </p>
              <button onClick={() => setConfirm(false)}>Cancelar</button>
              <button
                className="danger"
                disabled={pending}
                onClick={async () => {
                  if ((await run({ op: "delete", id: p.id })).ok) close();
                }}
              >
                Eliminar definitivamente
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
function Editable({
  value,
  label,
  save,
  multiline = false,
  max = 2000,
  className = "",
  list,
}: {
  value: string;
  label: string;
  save: (value: string) => Promise<{ ok: boolean }>;
  multiline?: boolean;
  max?: number;
  className?: string;
  list?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState("");
  const committed = useRef(value);
  async function blur() {
    if (draft === committed.current) return;
    setState("Guardando…");
    const result = await save(draft);
    if (result.ok) {
      committed.current = draft;
      setState("Guardado");
    } else setState("No guardado. Vuelve a salir del campo para reintentar.");
  }
  const props = {
    "aria-label": label,
    value: draft,
    maxLength: max,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: blur,
    className,
    placeholder: "Agrega aquí…",
  };
  return (
    <span className="editable">
      {multiline ? (
        <textarea {...props} rows={3} />
      ) : (
        <input {...props} list={list} />
      )}
      <small role="status">{state}</small>
    </span>
  );
}
function AddForm({
  label,
  placeholder,
  button = "Agregar",
  pending,
  submit,
}: {
  label: string;
  placeholder: string;
  button?: string;
  pending: boolean;
  submit: (text: string) => Promise<{ ok: boolean }>;
}) {
  return (
    <form
      className="add-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const value = new FormData(form).get("text") as string;
        if ((await submit(value)).ok) form.reset();
      }}
    >
      <input
        name="text"
        aria-label={label}
        placeholder={placeholder}
        maxLength={2000}
        required
      />
      <button disabled={pending}>{button}</button>
    </form>
  );
}
function EditableList({
  project: p,
  kind,
  run,
  pending,
}: {
  project: Project;
  kind: Item["kind"];
  run: Run;
  pending: boolean;
}) {
  const [items, setItems] = useState(p.items.filter((i) => i.kind === kind));
  useEffect(
    () => setItems(p.items.filter((i) => i.kind === kind)),
    [p.items, kind],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  async function drop(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const old = items;
    const next = arrayMove(
      items,
      items.findIndex((i) => i.id === e.active.id),
      items.findIndex((i) => i.id === e.over!.id),
    );
    setItems(next);
    if (
      !(
        await run({
          op: "reorder",
          projectId: p.id,
          kind,
          ids: next.map((i) => i.id),
        })
      ).ok
    )
      setItems(old);
  }
  return (
    <section className="panel-section">
      <h3>
        {kind === "status"
          ? "Dónde está"
          : kind === "idea"
            ? "Ideas"
            : "Preguntas abiertas"}{" "}
        <span className="count">{items.length}</span>
      </h3>
      <DndContext
        sensors={sensors}
        onDragEnd={drop}
        accessibility={dragAccessibility}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="editable-list">
            {items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                run={run}
                pending={pending}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <AddForm
        label={`Agregar ${kind === "question" ? "pregunta" : "ítem"}`}
        placeholder={
          kind === "question"
            ? "¿Qué falta por resolver?"
            : kind === "idea"
              ? "Una idea para este proyecto…"
              : "Agrega contexto…"
        }
        submit={(text) => run({ op: "addItem", projectId: p.id, kind, text })}
        pending={pending}
      />
    </section>
  );
}
function SortableItem({
  item,
  run,
  pending,
}: {
  item: Item;
  run: Run;
  pending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      className={`editable-row ${item.done ? "done" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${item.text}`}
      >
        ⠿
      </button>
      {item.kind === "question" && (
        <input
          type="checkbox"
          checked={item.done}
          aria-label={`Resolver: ${item.text}`}
          onChange={(e) =>
            run({ op: "editItem", id: item.id, done: e.target.checked })
          }
        />
      )}
      <Editable
        value={item.text}
        label="Texto del ítem"
        multiline
        save={(text) => run({ op: "editItem", id: item.id, text })}
      />
      <button
        disabled={pending}
        aria-label={`Quitar ${item.text}`}
        onClick={() => run({ op: "removeItem", id: item.id })}
      >
        ×
      </button>
    </div>
  );
}
