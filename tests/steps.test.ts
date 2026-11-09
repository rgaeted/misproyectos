import { describe, expect, it } from "vitest";
import { command } from "../lib/validation";
import { completedAtFor, stepSummary } from "../lib/steps";

describe("próximos pasos", () => {
  it("separa trabajo, esperas y completados sin volver a mostrar completados como pendientes", () => {
    const a = { id: "a", state: "waiting" as const };
    const b = { id: "b", state: "done" as const };
    const c = { id: "c", state: "todo" as const };
    expect(stepSummary([a, b, c])).toEqual({ todo: 1, waiting: 1, done: 1, pending: [a, c] });
    expect(stepSummary([])).toEqual({ todo: 0, waiting: 0, done: 0, pending: [] });
  });
  it("valida estados, textos y notas de espera", () => {
    expect(command.parse({ op: "addStep", projectId: "p", text: " Preparar propuesta " })).toMatchObject({ text: "Preparar propuesta", state: "todo", waitingOn: "" });
    expect(command.safeParse({ op: "addStep", projectId: "p", text: " " }).success).toBe(false);
    expect(command.safeParse({ op: "addStep", projectId: "p", text: "Paso", state: "inventado" }).success).toBe(false);
    expect(command.safeParse({ op: "addStep", projectId: "p", text: "Paso", state: "todo", waitingOn: "aprobación" }).success).toBe(false);
    expect(command.safeParse({ op: "addStep", projectId: "p", text: "Paso", state: "waiting", waitingOn: "a".repeat(501) }).success).toBe(false);
  });
  it("rechaza ediciones vacías y el antiguo campo único", () => {
    expect(command.safeParse({ op: "editStep", id: "03555b19-5081-42fe-b8e1-ec266f314487" }).success).toBe(false);
    expect(command.safeParse({ op: "update", id: "p", patch: { nextStep: "texto" } }).success).toBe(false);
  });
});

describe("fecha de completado", () => {
  it("completedAtFor fija, conserva y limpia la fecha", () => {
    const now = new Date("2026-11-09T20:00:00Z");
    const before = new Date("2026-11-08T15:00:00Z");
    expect(completedAtFor("todo", "done", null, now)).toEqual(now);
    expect(completedAtFor("done", "done", before, now)).toEqual(before);
    expect(completedAtFor("done", "todo", before, now)).toBeNull();
    expect(completedAtFor(null, "done", null, now)).toEqual(now);
    expect(completedAtFor(null, "todo", null, now)).toBeNull();
  });
  it("editar el texto de un paso completado conserva su fecha", () => {
    const now = new Date("2026-11-09T20:00:00Z");
    const before = new Date("2026-11-08T15:00:00Z");
    expect(completedAtFor("done", "done", before, now)).toBe(before);
  });
});
