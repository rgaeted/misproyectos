import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@octokit/rest", () => ({
  Octokit: class {
    request = mocks.request;
  },
}));
vi.mock("../lib/db", () => ({
  database: () => ({
    select: () => ({ from: () => ({ where: mocks.read }) }),
    insert: () => ({
      values: (value: unknown) => ({
        onConflictDoUpdate: async () => {
          mocks.save(value);
        },
      }),
    }),
  }),
}));
import { refreshRepos } from "../lib/github";
const repo = { owner: "ricardo", name: "proyecto" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  mocks.read.mockResolvedValue([]);
});
const response = (data: unknown, remaining = "100") => ({
  data,
  headers: { etag: '"test-etag"', "x-ratelimit-remaining": remaining },
});
describe("caché de GitHub", () => {
  it("guarda snapshot y cuenta issues y PRs por separado", async () => {
    mocks.request.mockImplementation(async (route: string) =>
      route.endsWith("/issues")
        ? response([
            {},
            {},
            {},
            { pull_request: {} },
            { pull_request: {} },
            { pull_request: {} },
          ])
        : route.endsWith("/commits")
          ? response([
              {
                commit: {
                  message: "Cambio",
                  committer: { date: "2026-11-01T12:00:00Z" },
                },
              },
            ])
          : response({ default_branch: "main", private: true }),
    );
    await refreshRepos([repo, repo]);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        openIssues: 3,
        openPrs: 3,
        commits7d: 1,
        isPrivate: true,
        error: null,
      }),
    );
  });
  it("reutiliza respuesta guardada ante 304", async () => {
    const key = JSON.stringify(["GET /repos/{owner}/{repo}", {}]);
    mocks.read.mockResolvedValue([
      {
        etagCache: {
          [key]: {
            etag: "old",
            data: { default_branch: "main", private: false },
          },
        },
      },
    ]);
    mocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}") throw { status: 304 };
      return response([]);
    });
    await refreshRepos([repo]);
    expect(mocks.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}",
      expect.objectContaining({ headers: { "if-none-match": "old" } }),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBranch: "main", error: null }),
    );
  });
  it("registra 404 y sigue con el siguiente repositorio", async () => {
    mocks.request.mockRejectedValue({ status: 404 });
    await refreshRepos([repo, { ...repo, name: "otro" }]);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ error: "not_found" }),
    );
  });
  it("se detiene si quedan menos de 50 peticiones sin marcar el repo como inaccesible", async () => {
    mocks.request.mockResolvedValue(response({}, "49"));
    await refreshRepos([repo, { ...repo, name: "otro" }]);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("no consulta la API si falta el token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    await expect(refreshRepos([repo])).rejects.toThrow("missing_token");
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
