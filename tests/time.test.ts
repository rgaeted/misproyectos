import { describe, expect, it } from "vitest";
import {
  buildReport,
  chileLocalToIso,
  formatClock,
  formatDuration,
  formatHoursDecimal,
  isoToChileLocal,
  startOfChileDay,
  stopActionFor,
  taskChangeFor,
  validEntryRange,
  weekStart,
} from "../lib/time";
import type { TimeEntry } from "../lib/time";
import { command } from "../lib/validation";

let counter = 0;
function entry(startedAt: string, endedAt: string | null, task: Partial<Pick<TimeEntry, "stepId" | "taskText">> = {}): TimeEntry {
  counter += 1;
  return { id: `e${counter}`, projectId: "p1", stepId: task.stepId ?? null, taskText: task.taskText ?? "", startedAt, endedAt };
}

const now = new Date("2026-11-20T12:00:00.000Z");

describe("startOfChileDay", () => {
  it("usa −3 en verano", () => {
    expect(startOfChileDay("2026-11-12").toISOString()).toBe("2026-11-12T03:00:00.000Z");
  });
  it("usa −4 en invierno", () => {
    expect(startOfChileDay("2026-07-01").toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });
  it("resuelve el día del cambio de hora de septiembre", () => {
    expect(startOfChileDay("2026-09-06").toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });
  it("resuelve el día del cambio de hora de abril", () => {
    expect(startOfChileDay("2026-04-05").toISOString()).toBe("2026-04-05T04:00:00.000Z");
    expect(startOfChileDay("2026-04-04").toISOString()).toBe("2026-04-04T03:00:00.000Z");
  });
});

describe("chileLocalToIso / isoToChileLocal", () => {
  it("convierte ida y vuelta", () => {
    expect(chileLocalToIso("2026-11-12T09:30")).toBe("2026-11-12T12:30:00.000Z");
    expect(isoToChileLocal("2026-11-12T12:30:00.000Z")).toBe("2026-11-12T09:30");
  });
  it("usa −4 en invierno", () => {
    expect(chileLocalToIso("2026-07-01T09:30")).toBe("2026-07-01T13:30:00.000Z");
  });
  it("usa −03:00 en la hora repetida de abril", () => {
    expect(chileLocalToIso("2026-04-04T23:30")).toBe("2026-04-05T02:30:00.000Z");
    expect(isoToChileLocal("2026-04-05T03:30:00.000Z")).toBe("2026-04-04T23:30");
  });
  it("muestra la medianoche como 00", () => {
    expect(isoToChileLocal("2026-11-12T03:00:00.000Z")).toBe("2026-11-12T00:00");
  });
});

describe("weekStart", () => {
  it("devuelve el lunes", () => {
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
});

describe("taskChangeFor", () => {
  const start = "2026-11-12T12:00:00.000Z";
  const at = (ms: number) => new Date(new Date(start).getTime() + ms);
  it("asigna si no hay tarea", () => {
    expect(taskChangeFor({ startedAt: start, stepId: null, taskText: "" }, at(5_000))).toBe("assign");
  });
  it("reemplaza si duró menos de un minuto", () => {
    expect(taskChangeFor({ startedAt: start, stepId: "s1", taskText: "x" }, at(30_000))).toBe("replace");
  });
  it("corta si duró más", () => {
    expect(taskChangeFor({ startedAt: start, stepId: "s1", taskText: "x" }, at(300_000))).toBe("split");
    expect(taskChangeFor({ startedAt: start, stepId: null, taskText: "Diseño" }, at(300_000))).toBe("split");
  });
});

describe("stopActionFor", () => {
  const start = "2026-11-12T12:00:00.000Z";
  const at = (ms: number) => new Date(new Date(start).getTime() + ms);
  it("descarta bajo un minuto y cierra sobre un minuto", () => {
    expect(stopActionFor({ startedAt: start, stepId: null, taskText: "" }, at(59_000))).toBe("discard");
    expect(stopActionFor({ startedAt: start, stepId: "s1", taskText: "x" }, at(59_000))).toBe("discard");
    expect(stopActionFor({ startedAt: start, stepId: null, taskText: "" }, at(61_000))).toBe("close");
  });
});

describe("validEntryRange", () => {
  const n = new Date("2026-11-12T15:00:00.000Z");
  const d = (iso: string) => new Date(iso);
  it("acepta un rango válido", () => {
    expect(validEntryRange(d("2026-11-12T12:00:00Z"), d("2026-11-12T13:00:00Z"), n)).toBe(true);
    expect(validEntryRange(d("2026-11-12T12:00:00Z"), n, n)).toBe(true);
  });
  it("rechaza rangos inválidos", () => {
    expect(validEntryRange(d("2026-11-12T12:00:00Z"), d("2026-11-12T12:00:00Z"), n)).toBe(false);
    expect(validEntryRange(d("2026-11-12T13:00:00Z"), d("2026-11-12T12:00:00Z"), n)).toBe(false);
    expect(validEntryRange(d("2026-11-12T12:00:00Z"), d("2026-11-12T15:00:01Z"), n)).toBe(false);
  });
});

describe("buildReport", () => {
  it("corta en la medianoche de Chile", () => {
    const report = buildReport([entry("2026-11-12T02:00:00.000Z", "2026-11-12T04:30:00.000Z")], [], "2026-11-01", "2026-11-30", now);
    expect(report.byDay.map((r) => [r.date, r.minutes])).toEqual([["2026-11-11", 60], ["2026-11-12", 90]]);
    expect(report.totalMinutes).toBe(150);
  });

  it("corta el día del cambio de hora", () => {
    const report = buildReport([entry("2026-09-06T03:00:00.000Z", "2026-09-06T05:00:00.000Z")], [], "2026-09-01", "2026-09-30", now);
    expect(report.byDay.map((r) => [r.date, r.minutes])).toEqual([["2026-09-05", 60], ["2026-09-06", 60]]);
  });

  it("recorta al período y cuenta el tramo corriendo hasta now", () => {
    const running = new Date("2026-11-12T14:15:00.000Z");
    const report = buildReport(
      [
        entry("2026-11-12T02:00:00.000Z", "2026-11-12T04:00:00.000Z", { taskText: "A" }),
        entry("2026-11-12T13:00:00.000Z", null, { taskText: "B" }),
      ],
      [],
      "2026-11-12",
      "2026-11-12",
      running,
    );
    expect(report.byDay.map((r) => [r.date, r.task, r.minutes])).toEqual([["2026-11-12", "A", 60], ["2026-11-12", "B", 75]]);
    expect(report.totalMinutes).toBe(135);
  });

  it("ignora tramos fuera del período o negativos", () => {
    const report = buildReport(
      [
        entry("2026-10-01T12:00:00.000Z", "2026-10-01T13:00:00.000Z"),
        entry("2026-11-12T13:00:00.000Z", "2026-11-12T12:00:00.000Z"),
      ],
      [],
      "2026-11-12",
      "2026-11-12",
      now,
    );
    expect(report).toEqual({ byTask: [], byDay: [], totalMinutes: 0 });
  });

  it("usa el texto copiado si el paso no existe y el texto actual si existe", () => {
    const report = buildReport(
      [
        entry("2026-11-12T12:00:00.000Z", "2026-11-12T13:00:00.000Z", { taskText: "Diseño login" }),
        entry("2026-11-12T13:00:00.000Z", "2026-11-12T13:30:00.000Z", { stepId: "s9", taskText: "Viejo texto" }),
      ],
      [{ id: "s9", text: "Texto actual" }],
      "2026-11-12",
      "2026-11-12",
      now,
    );
    expect(report.byTask).toEqual([
      { taskKey: "text:Diseño login", task: "Diseño login", minutes: 60 },
      { taskKey: "step:s9", task: "Texto actual", minutes: 30 },
    ]);
  });

  it("redondea por celda y cuadra con el total", () => {
    const base = new Date("2026-11-12T12:00:00.000Z").getTime();
    const len = 20 * 60_000 + 20_000;
    const entries = [0, 1, 2].map((i) =>
      entry(new Date(base + i * len).toISOString(), new Date(base + (i + 1) * len).toISOString(), { taskText: "A" }),
    );
    entries.push(entry("2026-11-13T12:00:00.000Z", "2026-11-13T12:00:25.000Z", { taskText: "B" }));
    const report = buildReport(entries, [], "2026-11-12", "2026-11-13", now);
    expect(report.byDay).toEqual([{ date: "2026-11-12", taskKey: "text:A", task: "A", minutes: 61 }]);
    expect(report.byTask[0].minutes).toBe(report.totalMinutes);
    expect(report.totalMinutes).toBe(61);
  });

  it("deja Sin tarea asignada al final y ordena el día por tarea", () => {
    const report = buildReport(
      [
        entry("2026-11-12T12:00:00.000Z", "2026-11-12T15:00:00.000Z"),
        entry("2026-11-12T15:00:00.000Z", "2026-11-12T15:30:00.000Z", { taskText: "Zeta" }),
        entry("2026-11-12T15:30:00.000Z", "2026-11-12T16:30:00.000Z", { taskText: "Árbol" }),
      ],
      [],
      "2026-11-12",
      "2026-11-12",
      now,
    );
    expect(report.byTask.map((r) => r.task)).toEqual(["Árbol", "Zeta", "Sin tarea asignada"]);
    expect(report.byTask[2].taskKey).toBe("none");
    expect(report.byDay.map((r) => r.task)).toEqual(["Árbol", "Sin tarea asignada", "Zeta"]);
  });
});

describe("comandos del reloj", () => {
  const stepId = "3f1c2b8e-9a4d-4c6e-8b2a-1d5e7f9a0b3c";
  const message = "Elige un paso o escribe una tarea.";
  it("setTimerTask exige un paso o un texto, no ambos", () => {
    const both = command.safeParse({ op: "setTimerTask", projectId: "p", stepId, text: "x" });
    expect(both.success).toBe(false);
    expect(both.error?.issues[0].message).toBe(message);
    const neither = command.safeParse({ op: "setTimerTask", projectId: "p" });
    expect(neither.success).toBe(false);
    expect(neither.error?.issues[0].message).toBe(message);
    expect(command.safeParse({ op: "setTimerTask", projectId: "p", stepId }).success).toBe(true);
    expect(command.safeParse({ op: "setTimerTask", projectId: "p", text: "Diseño" }).success).toBe(true);
  });
  it("editTimeEntry sin campos falla", () => {
    expect(command.safeParse({ op: "editTimeEntry", id: stepId }).success).toBe(false);
    expect(command.safeParse({ op: "editTimeEntry", id: stepId, stepId: null }).success).toBe(true);
  });
  it("addTimeEntry exige instantes ISO", () => {
    expect(command.safeParse({ op: "addTimeEntry", projectId: "p", startedAt: "ayer", endedAt: "2026-11-12T13:00:00Z" }).success).toBe(false);
    expect(command.safeParse({ op: "addTimeEntry", projectId: "p", startedAt: "2026-11-12T12:00:00Z", endedAt: "2026-11-12T13:00:00Z" }).success).toBe(true);
  });
  it("startTimer válido pasa", () => {
    expect(command.safeParse({ op: "startTimer", projectId: "p" }).success).toBe(true);
  });
});

describe("formatos", () => {
  it("formatDuration", () => {
    expect(formatDuration(135)).toBe("2 h 15 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(0)).toBe("0 min");
  });
  it("formatHoursDecimal", () => {
    expect(formatHoursDecimal(750)).toBe("12,5 h");
    expect(formatHoursDecimal(195)).toBe("3,25 h");
    expect(formatHoursDecimal(20)).toBe("0,33 h");
    expect(formatHoursDecimal(120)).toBe("2 h");
  });
  it("formatClock", () => {
    expect(formatClock(3_909_000)).toBe("01:05:09");
  });
});
