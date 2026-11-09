import { describe, expect, it } from "vitest";
import { command } from "../lib/validation";
import { addDays, daySummary, draftForTomorrow } from "../lib/day";
import type { DayList } from "../lib/day";
import type { Project, Step } from "../lib/data";

const step = (id: string, projectId: string, state: Step["state"], overrides: Partial<Step> = {}): Step => ({
  id, projectId, text: `Paso ${id}`, state, waitingOn: "", completedAt: null, position: 0, ...overrides,
});
const project = (overrides: Partial<Project> & { id: string }): Project => ({
  name: overrides.id.toUpperCase(), type: "", stage: null, lastUpdate: "", nextStep: "", noRepoNote: null,
  externalUrl: null, archived: false, items: [], steps: [], plans: [], payments: [], repos: [], ...overrides,
});
const TODAY = "2026-11-09";

describe("resumen y borrador del día", () => {
  it("addDays cruza meses y años", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("resumen usa la fecha de Chile", () => {
    const a = project({ id: "a", steps: [
      step("s1", "a", "done", { completedAt: "2026-11-10T02:30:00Z" }), // 23:30 del 9 en Chile
      step("s2", "a", "done", { completedAt: "2026-11-09T02:30:00Z" }), // 23:30 del 8 en Chile
      step("s3", "a", "todo"),
    ] });
    const summary = daySummary([a], null, TODAY);
    expect(summary.groups).toEqual([{ projectId: "a", projectName: "A", steps: ["Paso s1"], payments: [] }]);
    expect(summary.empty).toBe(false);
  });

  it("resumen incluye pagos registrados hoy e ítems libres tachados hoy", () => {
    const hotel = project({
      id: "h", name: "Hotel",
      plans: [{ id: "m", projectId: "h", concept: "Mensualidad", kind: "monthly", amountUf: 9, startDate: "2026-10-10", installments: null, endDate: null, position: 0 }],
      payments: [{ id: "p", planId: "m", seq: 0, dueDate: "2026-10-10", amountUf: 9, paidOn: "2026-10-10", ufValue: null, createdAt: "2026-11-09T15:00:00Z" }],
    });
    const list: DayList = { confirmedAt: "2026-11-08T22:00:00Z", items: [
      { id: "i1", stepId: null, projectId: null, projectName: null, text: "Llamar al contador", done: true, doneAt: "2026-11-09T14:00:00Z" },
      { id: "i2", stepId: null, projectId: null, projectName: null, text: "Otra cosa", done: true, doneAt: "2026-11-08T14:00:00Z" },
    ] };
    const summary = daySummary([hotel], list, TODAY);
    expect(summary.groups).toEqual([{ projectId: "h", projectName: "Hotel", steps: [], payments: ["Mensualidad · 9,00 UF"] }]);
    expect(summary.freeItems).toEqual(["Llamar al contador"]);
    expect(daySummary([project({ id: "z" })], null, TODAY)).toEqual({ groups: [], freeItems: [], empty: true });
  });

  it("borrador: arrastra pendientes, primer paso por proyecto, sin duplicados", () => {
    const a = project({ id: "a", steps: [step("a1", "a", "done"), step("a2", "a", "waiting"), step("a3", "a", "todo"), step("a4", "a", "todo")] });
    const b = project({ id: "b", archived: true, steps: [step("b1", "b", "todo")] });
    const list: DayList = { confirmedAt: "2026-11-08T22:00:00Z", items: [
      { id: "i1", stepId: "a3", projectId: "a", projectName: "A", text: "Paso a3", done: false, doneAt: null },
      { id: "i2", stepId: null, projectId: null, projectName: null, text: "Llamar al contador", done: false, doneAt: null },
      { id: "i3", stepId: "a1", projectId: "a", projectName: "A", text: "Paso a1", done: true, doneAt: null },
    ] };
    expect(draftForTomorrow([a, b], list, TODAY).map((item) => item.key)).toEqual(["step:a3", "text:Llamar al contador"]);
  });

  it("borrador: sin lista previa toma el primer paso por trabajar de cada proyecto activo", () => {
    const a = project({ id: "a", steps: [step("a1", "a", "done"), step("a2", "a", "todo")] });
    expect(draftForTomorrow([a], null, TODAY)).toEqual([{ key: "step:a2", kind: "step", stepId: "a2", projectName: "A", text: "Paso a2" }]);
  });

  it("borrador: un paso borrado queda como texto", () => {
    const list: DayList = { confirmedAt: "2026-11-08T22:00:00Z", items: [
      { id: "i1", stepId: null, projectId: null, projectName: null, text: "Paso viejo", done: false, doneAt: null },
    ] };
    expect(draftForTomorrow([], list, TODAY)).toEqual([{ key: "text:Paso viejo", kind: "text", text: "Paso viejo" }]);
  });

  it("borrador: pagos atrasados y que vencen mañana", () => {
    const hotel = project({ id: "h", name: "Hotel", plans: [
      { id: "m", projectId: "h", concept: "Mensualidad", kind: "monthly", amountUf: 9, startDate: "2026-10-10", installments: null, endDate: null, position: 0 },
    ] });
    const texts = draftForTomorrow([hotel], null, TODAY).map((item) => item.text);
    expect(texts).toEqual([
      "Cobrar Hotel · Mensualidad 9,00 UF (atrasado, venció 10-10-2026)",
      "Cobrar Hotel · Mensualidad 9,00 UF (vence 10-11-2026)",
    ]);
  });
});

describe("validación del día", () => {
  const id = "03555b19-5081-42fe-b8e1-ec266f314487";
  it("confirmDayList acepta pasos y texto libre, y recorta", () => {
    const parsed = command.parse({ op: "confirmDayList", items: [{ stepId: id }, { text: " Llamar " }] });
    expect(parsed).toMatchObject({ items: [{ stepId: id }, { text: "Llamar" }] });
    expect(command.safeParse({ op: "confirmDayList", items: [] }).success).toBe(true);
  });
  it("confirmDayList rechaza ítems vacíos, ids inválidos y más de 100", () => {
    expect(command.safeParse({ op: "confirmDayList", items: [{ text: " " }] }).success).toBe(false);
    expect(command.safeParse({ op: "confirmDayList", items: [{ stepId: "x" }] }).success).toBe(false);
    expect(command.safeParse({ op: "confirmDayList", items: Array.from({ length: 101 }, () => ({ text: "a" })) }).success).toBe(false);
  });
  it("toggleDayItem exige done", () => {
    expect(command.safeParse({ op: "toggleDayItem", id }).success).toBe(false);
    expect(command.safeParse({ op: "toggleDayItem", id, done: true }).success).toBe(true);
  });
});
