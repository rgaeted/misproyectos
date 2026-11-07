import { describe, expect, it } from "vitest";
import {
  addMonths, dueDateFor, formatClp, formatUf, paidOnFor, paymentsOverview,
  planSchedule, projectPayments, todayInChile, ufToClp,
} from "../lib/payments";

const hotel = { projectId: "h", startDate: "2026-01-10", endDate: null, position: 0 };
const mensual = { ...hotel, id: "m", concept: "Mensualidad", kind: "monthly" as const, amountUf: 9, installments: null };
const impl = { ...hotel, id: "i", concept: "Implementación", kind: "installments" as const, amountUf: 10, installments: 3, position: 1 };

describe("pagos", () => {
  it("ancla el día y recorta a fin de mes", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });
  it("hotel: 19 UF los tres primeros meses y 9 UF después", () => {
    const { upcoming } = projectPayments([mensual, impl], [], "2026-01-01");
    const byMonth = (m: string) => upcoming.filter((r) => r.dueDate.startsWith(m)).reduce((s, r) => s + r.amountUf, 0);
    expect([byMonth("2026-01"), byMonth("2026-03"), byMonth("2026-04")]).toEqual([19, 19, 9]);
    expect(upcoming.filter((r) => r.planId === "m").at(-1)!.dueDate).toBe("2026-12-10"); // horizonte: hasta hoy + 12 meses (2027-01-01)
  });
  it("marca atrasados y los pone primero", () => {
    const { upcoming } = projectPayments([mensual], [], "2026-03-11");
    expect(upcoming.slice(0, 3).map((r) => [r.dueDate, r.status])).toEqual([
      ["2026-01-10", "overdue"], ["2026-02-10", "overdue"], ["2026-03-10", "overdue"]]);
    expect(upcoming[3]).toMatchObject({ dueDate: "2026-04-10", status: "pending" });
  });
  it("un pago fuera del calendario sigue en Pagado con su monto", () => {
    const cuatro = { ...impl, installments: 4 };
    const pagada = { id: "x", planId: "i", seq: 3, dueDate: "2026-04-10", amountUf: 12, paidOn: "2026-04-10", ufValue: 39000 };
    const r = projectPayments([{ ...impl, installments: 3 }], [pagada], "2026-05-01");
    expect(r.paid).toHaveLength(1);
    expect(r.totalPaidUf).toBe(12);
    expect(r.upcoming.some((u) => u.seq === 3)).toBe(false);
    expect(dueDateFor(cuatro, 3)).toBe("2026-04-10");
    expect(dueDateFor({ ...impl, installments: 3 }, 3)).toBeNull();
  });
  it("mensual terminado no genera pagos después del término", () => {
    expect(planSchedule({ ...mensual, endDate: "2026-03-10" }, "2027-01-01").map((e) => e.dueDate))
      .toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });
  it("hoy es la fecha de Chile", () => {
    expect(todayInChile(new Date("2026-12-01T01:30:00Z"))).toBe("2026-11-30");
  });
  it("un pago que vence hoy en Chile no está atrasado", () => {
    const { upcoming } = projectPayments([{ ...mensual, startDate: "2026-11-30" }], [], todayInChile(new Date("2026-12-01T01:30:00Z")));
    expect(upcoming[0]).toMatchObject({ dueDate: "2026-11-30", status: "pending" });
  });
  it("fecha de pago es la más temprana entre hoy y el vencimiento", () => {
    expect(paidOnFor("2026-02-10", "2026-11-07")).toBe("2026-02-10");
    expect(paidOnFor("2026-12-10", "2026-11-07")).toBe("2026-11-07");
  });
  it("vista general: mes, próximo mes, atrasados, archivados y año", () => {
    const pago = { id: "p", planId: "m", seq: 0, dueDate: "2026-01-10", amountUf: 9, paidOn: "2026-01-10", ufValue: 38000 };
    const sinUf = { ...pago, id: "q", seq: 1, dueDate: "2026-02-10", paidOn: "2026-02-10", ufValue: null };
    const o = paymentsOverview([
      { id: "h", name: "Hotel", archived: false, plans: [mensual], payments: [pago, sinUf] },
      { id: "z", name: "Viejo", archived: true, plans: [{ ...mensual, id: "z1", projectId: "z" }], payments: [] },
    ], "2026-03-05");
    expect(o.overdue.rows).toHaveLength(0);
    expect(o.thisMonth.rows.map((r) => r.dueDate)).toEqual(["2026-03-10"]);
    expect(o.nextMonth.totalUf).toBe(9);
    expect(o.collectedYear).toEqual({ uf: 18, clp: 342000, clpComplete: false });
  });
  it("formatea UF y pesos", () => {
    expect(formatUf(9)).toBe("9,00 UF");
    expect(formatUf(1234.5)).toBe("1.234,50 UF");
    expect(formatClp(342150.4)).toBe("$ 342.150");
    expect(ufToClp(9, 38016.67)).toBe(342150);
  });
});
