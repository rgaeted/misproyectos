import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));
vi.mock("../lib/db", () => ({ withUserDatabase: vi.fn() }));
import { withUserDatabase } from "../lib/db";
import { getBoard } from "../lib/data";
import { projects, timeEntries } from "../lib/db/schema";

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
    await expect(getBoard("03555b19-5081-42fe-b8e1-ec266f314487")).resolves.toEqual({ projects: [], inbox: [], dayList: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("incluye planes y pagos en cada proyecto", async () => {
    returnQueries(Promise.resolve([{ id: "p1", archived: false }]));
    const board = await getBoard("03555b19-5081-42fe-b8e1-ec266f314487");
    expect(board.projects[0]).toMatchObject({ id: "p1", plans: [], payments: [] });
  });

  it("incluye el tramo corriendo de cada proyecto", async () => {
    const rows = new Map<unknown, unknown[]>([
      [projects, [{ id: "p1", archived: false }, { id: "p2", archived: false }]],
      [timeEntries, [{ id: "t1", projectId: "p1", stepId: null, taskText: "Revisar", startedAt: new Date("2026-11-12T10:00:00Z"), endedAt: null }]],
    ]);
    vi.mocked(withUserDatabase).mockImplementation(async (_userId, work) => work({
      select: () => ({
        from: (table: unknown) => {
          const result = Promise.resolve(rows.get(table) ?? []);
          const query: unknown = Object.assign(result, { orderBy: () => result, where: () => query, innerJoin: () => query });
          return query;
        },
      }),
    } as never));
    const board = await getBoard("03555b19-5081-42fe-b8e1-ec266f314487");
    expect(board.projects[0].runningTimer).toMatchObject({ id: "t1", projectId: "p1", startedAt: "2026-11-12T10:00:00.000Z", endedAt: null });
    expect(board.projects[1].runningTimer).toBeNull();
  });
});
