import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));
import { fetchUf, parseUfResponse } from "../lib/uf";

afterEach(() => vi.unstubAllGlobals());

describe("valor UF", () => {
  it("lee el valor desde la respuesta de mindicador", () => {
    expect(parseUfResponse({ serie: [{ fecha: "2026-11-07", valor: 39812.34 }] })).toBe(39812.34);
    expect(parseUfResponse({ serie: [] })).toBeNull();
    expect(parseUfResponse(null)).toBeNull();
    expect(parseUfResponse({ serie: [{ valor: "x" }] })).toBeNull();
  });
  it("consulta la fecha pedida en formato dd-mm-yyyy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ serie: [{ valor: 38000 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchUf("2026-02-10")).resolves.toBe(38000);
    expect(fetchMock.mock.calls[0][0]).toBe("https://mindicador.cl/api/uf/10-02-2026");
    await fetchUf();
    expect(fetchMock.mock.calls[1][0]).toBe("https://mindicador.cl/api/uf");
  });
  it("devuelve null sin lanzar error si la API falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("red")));
    await expect(fetchUf()).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchUf()).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("json"); } }));
    await expect(fetchUf()).resolves.toBeNull();
  });
});
