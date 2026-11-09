"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/actions";
import type { DaySummary, DraftItem } from "@/lib/day";

type ExtraStep = { stepId: string; projectName: string; text: string };

export function DayClose({ summary, draft, extraSteps }: { summary: DaySummary; draft: DraftItem[]; extraSteps: ExtraStep[] }) {
  const router = useRouter();
  const [items, setItems] = useState<DraftItem[]>(draft);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const taken = new Set(items.map((item) => item.key));
  const available = extraSteps.filter((step) => !taken.has(`step:${step.stepId}`));

  function addText() {
    const value = text.trim();
    if (!value || taken.has(`text:${value}`)) return;
    setItems([...items, { key: `text:${value}`, kind: "text", text: value }]);
    setText("");
  }
  async function confirm() {
    setSaving(true);
    setError("");
    const result = await mutate({
      op: "confirmDayList",
      items: items.map((item) => (item.kind === "step" ? { stepId: item.stepId } : { text: item.text })),
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    router.push("/");
    router.refresh();
  }

  return <main className="day-close">
    <header className="payments-page-header">
      <Link href="/">← Volver al tablero</Link>
      <h1>Cerrar el día</h1>
    </header>
    <section className="panel-section">
      <h2>Lo que hice hoy</h2>
      {summary.empty ? <p className="muted">Hoy no registraste avances en el tablero.</p> : <>
        {summary.groups.map((group) => <div key={group.projectId} className="day-group">
          <h3>{group.projectName}</h3>
          <ul>
            {group.steps.map((step) => <li key={`s:${step}`}>{step}</li>)}
            {group.payments.map((payment) => <li key={`p:${payment}`}>Cobrado: {payment}</li>)}
          </ul>
        </div>)}
        {summary.freeItems.length > 0 && <div className="day-group">
          <h3>Otras cosas</h3>
          <ul>{summary.freeItems.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}
      </>}
    </section>
    <section className="panel-section">
      <h2>Borrador para mañana</h2>
      {items.length === 0 && <p className="muted">La lista está vacía.</p>}
      <ul className="draft-list">
        {items.map((item) => <li key={item.key}>
          <span>{item.kind === "step" && <strong>{item.projectName} · </strong>}{item.text}</span>
          <button type="button" disabled={saving} aria-label={`Quitar: ${item.text}`}
            onClick={() => setItems(items.filter((other) => other.key !== item.key))}>Quitar</button>
        </li>)}
      </ul>
      <form className="new-step-form" onSubmit={(event) => { event.preventDefault(); addText(); }}>
        <label>Agregar algo<input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Ej.: llamar al contador" disabled={saving} /></label>
        <div className="new-step-actions"><button type="submit" disabled={saving || !text.trim()}>Agregar</button></div>
      </form>
      {available.length > 0 && <label className="day-extra">Agregar otro paso
        <select value="" disabled={saving} onChange={(event) => {
          const step = available.find((candidate) => candidate.stepId === event.target.value);
          if (step) setItems([...items, { key: `step:${step.stepId}`, kind: "step", stepId: step.stepId, projectName: step.projectName, text: step.text }]);
        }}>
          <option value="">Elige un paso…</option>
          {available.map((step) => <option key={step.stepId} value={step.stepId}>{step.projectName} · {step.text}</option>)}
        </select>
      </label>}
      {error && <p role="alert" className="day-error">{error}</p>}
      <button className="primary" type="button" disabled={saving} onClick={confirm}>{saving ? "Guardando…" : "Confirmar lista de mañana"}</button>
    </section>
  </main>;
}
