"use client";
import { useState } from "react";
import type { Run } from "./Workspace";
import {
  addMonths, formatClp, formatUf, planKindLabels, planKinds, projectPayments, todayInChile, ufToClp,
  type PaidPayment, type PaymentPlan, type PaymentRow, type PlanKind,
} from "@/lib/payments";

export const displayDate = (date: string) => `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`;

function planDetail(plan: PaymentPlan) {
  if (plan.kind === "once") return `el ${displayDate(plan.startDate)}`;
  if (plan.kind === "installments") return `${plan.installments} cuotas desde ${displayDate(plan.startDate)}`;
  return `desde ${displayDate(plan.startDate)}${plan.endDate ? ` hasta ${displayDate(plan.endDate)}` : ", sin término"}`;
}

export function Payments({ projectId, plans, payments, ufToday, run, pending }: {
  projectId: string; plans: PaymentPlan[]; payments: PaidPayment[]; ufToday: number | null; run: Run; pending: boolean;
}) {
  const today = todayInChile();
  const { paid, upcoming, totalPaidUf } = projectPayments(plans, payments, today);
  const overdueUf = upcoming.filter((row) => row.status === "overdue").reduce((sum, row) => sum + row.amountUf, 0);
  const paidClp = paid.reduce((sum, row) => sum + (row.ufValue === null ? 0 : ufToClp(row.amountUf, row.ufValue)), 0);
  const missingClp = paid.some((row) => row.ufValue === null);
  const [kind, setKind] = useState<PlanKind>("monthly");
  const [editing, setEditing] = useState<string | null>(null);
  const pesos = (uf: number) => (ufToday ? ` ≈ ${formatClp(ufToClp(uf, ufToday))}` : "");

  return <section className="panel-section payments" aria-labelledby="payments-title">
    <div className="section-title"><h3 id="payments-title">Pagos <span className="count">{plans.length}</span></h3></div>
    <p className="steps-counts">{ufToday ? `UF hoy: ${formatClp(ufToday)}` : "Sin valor UF disponible; se muestran solo UF."}</p>
    {!!plans.length && <p className="payments-summary">
      <strong>Cobrado: {formatUf(totalPaidUf)}</strong>{paid.length > 0 && ` (${formatClp(paidClp)}${missingClp ? ", algunos pagos sin valor en pesos" : ""})`}
      {overdueUf > 0 && <span className="payment-overdue-total"> · Atrasado: {formatUf(overdueUf)}</span>}
    </p>}
    {!plans.length && <p className="steps-empty">Agrega un plan de pago: un pago único, cuotas o una mensualidad.</p>}

    {upcoming.length > 0 && <>
      <h4>Por cobrar</h4>
      <ul className="payment-list">
        {upcoming.map((row) => <PaymentItem key={`${row.planId}:${row.seq}`} row={row} extra={pesos(row.amountUf)} pending={pending}
          action="Marcar pagado" label={`Marcar pagado: ${row.concept} ${displayDate(row.dueDate)}`}
          onAction={() => run({ op: "markPaid", planId: row.planId, seq: row.seq })} />)}
      </ul>
    </>}
    {paid.length > 0 && <>
      <h4>Pagado</h4>
      <ul className="payment-list">
        {paid.map((row) => <PaymentItem key={`${row.planId}:${row.seq}`} row={row}
          extra={row.ufValue === null ? "" : ` ${formatClp(ufToClp(row.amountUf, row.ufValue))}`} pending={pending}
          action="Desmarcar" label={`Desmarcar pago: ${row.concept} ${displayDate(row.dueDate)}`}
          onAction={() => run({ op: "unmarkPaid", planId: row.planId, seq: row.seq })} />)}
      </ul>
    </>}

    {plans.length > 0 && <>
      <h4>Planes</h4>
      <ul className="payment-list">
        {plans.map((plan) => {
          const count = payments.filter((payment) => payment.planId === plan.id).length;
          return <li key={plan.id} className="payment-plan">
            <div className="payment-line">
              <span><strong>{plan.concept}</strong> · {planKindLabels[plan.kind]} · {formatUf(plan.amountUf)} · {planDetail(plan)}</span>
              <span className="payment-actions">
                <button type="button" disabled={pending} onClick={() => setEditing(editing === plan.id ? null : plan.id)}>{editing === plan.id ? "Cerrar" : "Editar"}</button>
                <button type="button" disabled={pending} aria-label={`Eliminar plan: ${plan.concept}`} onClick={() => {
                  const warning = count ? ` También se borrarán sus ${count} pagos registrados.` : "";
                  if (window.confirm(`¿Eliminar el plan «${plan.concept}»?${warning}`)) run({ op: "deletePlan", id: plan.id });
                }}>Eliminar</button>
              </span>
            </div>
            {editing === plan.id && <EditPlan plan={plan} today={today} run={run} pending={pending} done={() => setEditing(null)} />}
          </li>;
        })}
      </ul>
    </>}

    <form className="new-step-form" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const f = new FormData(form);
      const result = await run({
        op: "addPlan", projectId, concept: String(f.get("concept") || ""), kind,
        amountUf: Number(f.get("amount")), startDate: String(f.get("startDate") || ""),
        ...(kind === "installments" ? { installments: Number(f.get("installments")) } : {}),
      });
      if (result.ok) form.reset();
    }}>
      <label>Concepto<input name="concept" placeholder="Ej.: Mensualidad" required maxLength={120} disabled={pending} /></label>
      <label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value as PlanKind)} disabled={pending}>
        {planKinds.map((k) => <option key={k} value={k}>{planKindLabels[k]}</option>)}
      </select></label>
      <label>Monto en UF{kind === "installments" ? " (por cuota)" : ""}<input name="amount" type="number" step="0.01" min="0.01" required disabled={pending} /></label>
      <label>Fecha del primer pago<input name="startDate" type="date" required disabled={pending} /></label>
      {kind === "installments" && <label>Cantidad de cuotas<input name="installments" type="number" min="2" max="120" step="1" required disabled={pending} /></label>}
      <div className="new-step-actions"><button className="primary" disabled={pending}>Agregar plan</button></div>
    </form>
  </section>;
}

function PaymentItem({ row, extra, action, label, onAction, pending }: {
  row: PaymentRow; extra: string; action: string; label: string; onAction: () => void; pending: boolean;
}) {
  return <li className={`payment-row ${row.status}`}>
    <span className="payment-date">{displayDate(row.status === "paid" ? row.paidOn ?? row.dueDate : row.dueDate)}</span>
    <span className="payment-concept">{row.concept}{row.status === "overdue" && <em className="payment-flag"> Atrasado</em>}</span>
    <span className="payment-amount">{formatUf(row.amountUf)}{extra}</span>
    <button type="button" disabled={pending} aria-label={label} onClick={onAction}>{action}</button>
  </li>;
}

function EditPlan({ plan, today, run, pending, done }: { plan: PaymentPlan; today: string; run: Run; pending: boolean; done: () => void }) {
  const terminations: string[] = [];
  if (plan.kind === "monthly") {
    const limit = addMonths(today, 24);
    for (let seq = 0; seq < 240 && addMonths(plan.startDate, seq) <= limit; seq++) terminations.push(addMonths(plan.startDate, seq));
  }
  return <div className="payment-edit">
    <form onSubmit={async (event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      const result = await run({
        op: "editPlan", id: plan.id, concept: String(f.get("concept") || ""), amountUf: Number(f.get("amount")),
        startDate: String(f.get("startDate") || ""),
        ...(plan.kind === "installments" ? { installments: Number(f.get("installments")) } : {}),
      });
      if (result.ok) done();
    }}>
      <label>Concepto<input name="concept" defaultValue={plan.concept} required maxLength={120} disabled={pending} /></label>
      <label>Monto en UF<input name="amount" type="number" step="0.01" min="0.01" defaultValue={plan.amountUf} required disabled={pending} /></label>
      <label>Fecha del primer pago<input name="startDate" type="date" defaultValue={plan.startDate} required disabled={pending} /></label>
      {plan.kind === "installments" && <label>Cantidad de cuotas<input name="installments" type="number" min="2" max="120" defaultValue={plan.installments ?? 2} required disabled={pending} /></label>}
      <button className="primary" disabled={pending}>Guardar cambios</button>
    </form>
    {plan.kind === "monthly" && <div className="payment-end">
      <label>Último mes que se cobra
        <select value={plan.endDate ?? ""} disabled={pending} onChange={(event) => run({ op: "editPlan", id: plan.id, endDate: event.target.value || null })}>
          <option value="">Sin término</option>
          {terminations.map((date) => <option key={date} value={date}>{displayDate(date)}</option>)}
        </select>
      </label>
    </div>}
  </div>;
}
