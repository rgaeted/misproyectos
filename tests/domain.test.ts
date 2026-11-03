import { describe, it, expect } from "vitest";
import { staleDays, stages } from "../lib/stages";
import { githubUrl, command } from "../lib/validation";
import seed from "../data/seed.json";
import { isAllowedLogin } from "../lib/access";
describe("acceso de una sola cuenta", () => {
  it("rechaza cualquier otra cuenta y configuraciones vacías", () => {
    expect(isAllowedLogin("intruso", "rgaeted")).toBe(false);
    expect(isAllowedLogin("rgaeted", undefined)).toBe(false);
    expect(isAllowedLogin(undefined, "rgaeted")).toBe(false);
    expect(isAllowedLogin("Rgaeted", "rgaeted")).toBe(true);
  });
});
describe("actividad de proyectos", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  it("usa el commit más reciente entre repos", () => {
    expect(
      staleDays(
        "en_desarrollo",
        ["2026-09-01T12:00:00Z", "2026-11-01T12:00:00Z"],
        now,
      ),
    ).toBeNull();
  });
  it("marca solo después del umbral de 14 días", () => {
    expect(staleDays("en_ejecucion", ["2026-10-20T12:00:00Z"], now)).toBeNull();
    expect(staleDays("en_ejecucion", ["2026-10-19T12:00:00Z"], now)).toBe(15);
  });
  it("no marca sin repos o en pausa", () => {
    expect(staleDays("en_desarrollo", [], now)).toBeNull();
    expect(staleDays("en_pausa", ["2026-09-01T12:00:00Z"], now)).toBeNull();
  });
});
describe("validación", () => {
  it("normaliza las URLs de GitHub", () => {
    expect(
      githubUrl.parse(" https://github.com/Rgaeted/Liga-Futbol.git/ "),
    ).toEqual({ owner: "rgaeted", name: "liga-futbol" });
  });
  it.each([
    "https://example.com/a/b",
    "https://github.com/a",
    "https://github.com/a/b/issues",
    "javascript:alert(1)",
    "https://github.com/a/..",
  ])("rechaza enlaces ajenos o malformados: %s", (url) => {
    expect(githubUrl.safeParse(url).success).toBe(false);
  });
  it("limita longitudes y rechaza campos extra", () => {
    expect(
      command.safeParse({ op: "create", name: "a".repeat(121) }).success,
    ).toBe(false);
    expect(
      command.safeParse({
        op: "update",
        id: "p",
        patch: { externalUrl: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      command.safeParse({ op: "update", id: "p", patch: { id: "otro" } })
        .success,
    ).toBe(false);
  });
});
describe("datos iniciales", () => {
  it("conserva 11 proyectos y todas las etapas válidas", () => {
    expect(seed.projects).toHaveLength(11);
    expect(new Set(seed.projects.map((p) => p.id)).size).toBe(11);
    expect(
      seed.projects.every(
        (p) =>
          p.stage === null ||
          stages.includes(p.stage as (typeof stages)[number]),
      ),
    ).toBe(true);
    expect(
      seed.projects.filter((p) =>
        ["en_desarrollo", "en_ejecucion"].includes(p.stage ?? ""),
      ),
    ).toHaveLength(5);
  });
});
