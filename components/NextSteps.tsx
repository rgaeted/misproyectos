"use client";
import { useEffect, useRef, useState } from "react";
import type { Step } from "@/lib/data";
import type { Run } from "./Workspace";
import { stepLabels, stepStates, stepSummary, type StepState } from "@/lib/steps";

export function NextSteps({ projectId, steps, run, pending }: { projectId: string; steps: Step[]; run: Run; pending: boolean }) {
  const [newState, setNewState] = useState<StepState>("todo");
  const summary = stepSummary(steps);
  async function move(index: number, direction: number) {
    const ids = steps.map((step) => step.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await run({ op: "reorderSteps", projectId, ids });
  }
  return <section className="panel-section next-steps" aria-labelledby="next-steps-title">
    <div className="section-title"><h3 id="next-steps-title">Próximos pasos <span className="count">{steps.length}</span></h3></div>
    {!!steps.length && <p className="steps-counts"><span className={summary.todo > 0 ? "work-count" : undefined}>{summary.todo} por trabajar</span><span>{summary.waiting} en espera</span><span>{summary.done} completados</span></p>}
    <div className="steps-list">
      {steps.map((step, index) => <div key={step.id} className={`step-row ${step.state}`}>
        <div className="step-row-header">
          <select aria-label={`Estado del paso: ${step.text}`} value={step.state} disabled={pending} onChange={(event) => run({ op: "editStep", id: step.id, state: event.target.value as StepState })}>
            {stepStates.map((state) => <option value={state} key={state}>{stepLabels[state]}</option>)}
          </select>
          <div className="step-controls">
            <button type="button" disabled={pending || index === 0} aria-label={`Subir paso: ${step.text}`} onClick={() => move(index, -1)}>↑</button>
            <button type="button" disabled={pending || index === steps.length - 1} aria-label={`Bajar paso: ${step.text}`} onClick={() => move(index, 1)}>↓</button>
            <button type="button" disabled={pending} aria-label={`Eliminar paso: ${step.text}`} onClick={() => run({ op: "removeStep", id: step.id })}>×</button>
          </div>
        </div>
        <StepField value={step.text} label={`Texto del paso: ${step.text}`} pending={pending} max={2000} multiline save={(text) => run({ op: "editStep", id: step.id, text })} />
        {step.state === "waiting" && <label className="waiting-field">¿Qué estás esperando?
          <StepField value={step.waitingOn} label={`En espera de: ${step.text}`} pending={pending} max={500} placeholder="Ej.: respuesta del cliente o acceso al servidor" save={(waitingOn) => run({ op: "editStep", id: step.id, waitingOn })} />
        </label>}
      </div>)}
    </div>
    {!steps.length && <p className="steps-empty">Divide lo que viene en pasos pequeños. Marca lo que puedes trabajar y lo que está esperando algo.</p>}
    <form className="new-step-form" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      const result = await run({ op: "addStep", projectId, text: String(fields.get("text") || ""), state: newState, waitingOn: newState === "waiting" ? String(fields.get("waitingOn") || "") : "" });
      if (result.ok) { form.reset(); setNewState("todo"); }
    }}>
      <label>Nuevo paso<input name="text" aria-label="Nuevo paso" placeholder="¿Qué sigue para este proyecto?" required maxLength={2000} disabled={pending || steps.length >= 500} /></label>
      <div className="new-step-actions"><select aria-label="Estado del nuevo paso" value={newState} onChange={(event) => setNewState(event.target.value as StepState)} disabled={pending}>
        <option value="todo">Por trabajar</option><option value="waiting">En espera</option>
      </select><button className="primary" disabled={pending || steps.length >= 500}>Agregar paso</button></div>
      {newState === "waiting" && <label>¿Qué estás esperando?<input name="waitingOn" aria-label="En espera de" maxLength={500} placeholder="Ej.: una aprobación, material o una respuesta" disabled={pending} /></label>}
      {steps.length >= 500 && <p className="steps-empty">Este proyecto alcanzó el límite de 500 pasos.</p>}
    </form>
  </section>;
}

function StepField({ value, label, placeholder, max, multiline, pending, save }: { value: string; label: string; placeholder?: string; max: number; multiline?: boolean; pending: boolean; save: (value: string) => Promise<{ ok: boolean }> }) {
  const [draft, setDraft] = useState(value);
  const [message, setMessage] = useState("");
  const committed = useRef(value);
  useEffect(() => { setDraft(value); committed.current = value; }, [value]);
  async function commit() {
    const next = draft.trim();
    if (next === committed.current) return;
    setMessage("Guardando…");
    if ((await save(next)).ok) { committed.current = next; setDraft(next); setMessage(""); }
    else setMessage("No se guardó. Vuelve a salir del campo para reintentar.");
  }
  const props = { "aria-label": label, value: draft, placeholder, maxLength: max, disabled: pending, onBlur: commit, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value) };
  return <span className="step-editable">{multiline ? <textarea className="step-text" {...props} rows={2} /> : <input {...props} />}{message && <small role="status">{message}</small>}</span>;
}
