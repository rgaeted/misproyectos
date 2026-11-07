import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));
vi.mock("../lib/db", () => ({ withUserDatabase: vi.fn() }));
import { withUserDatabase } from "../lib/db";
import { getBoard } from "../lib/data";

function returnQueries(result: Promise<unknown[]>) {
  const query = Object.assign(result, { orderBy: () => result, where: () => query, innerJoin: () => query });
  vi.mocked(withUserDatabase).mockImplementation(async (_userId, work) => work({
    select: () => ({ from: () => query }),
  } as never));
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("carga del tablero", () => {
  it("termina la espera cuando la base deja una consulta pendiente", async () => {
    vi.useFakeTimers();
    returnQueries(new Promise(() => {}));
    const result = expect(getBoard("03555b19-5081-42fe-b8e1-ec266f314487")).rejects.toThrow("15 segundos");
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("devuelve los datos y limpia el plazo cuando las consultas terminan", async () => {
    vi.useFakeTimers();
    returnQueries(Promise.resolve([]));
    await expect(getBoard("03555b19-5081-42fe-b8e1-ec266f314487")).resolves.toEqual({ projects: [], inbox: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
});
