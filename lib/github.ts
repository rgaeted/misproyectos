import "server-only";
import { Octokit } from "@octokit/rest";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withUserDatabase } from "./db";
import { repoSnapshots } from "./db/schema";
class LowQuota extends Error {}
const repoSchema = z.object({
  default_branch: z.string(),
  private: z.boolean(),
});
const commitsSchema = z.array(
  z.object({
    commit: z.object({
      message: z.string(),
      committer: z.object({ date: z.string().nullable() }).nullable(),
    }),
  }),
);
const issuesSchema = z.array(
  z.object({ pull_request: z.object({}).optional() }),
);
export async function refreshRepos(repos: { owner: string; name: string }[], userId: string, token: string) {
  if (!token) throw new Error("missing_token");
  const api = new Octokit({ auth: token });
  for (const repo of Array.from(
    new Map(repos.map((r) => [`${r.owner}/${r.name}`, r])).values(),
  )) {
    const { owner, name } = repo;
    const [old] = await withUserDatabase(userId, (db) => db
      .select()
      .from(repoSnapshots)
      .where(and(eq(repoSnapshots.userId, userId), eq(repoSnapshots.owner, owner), eq(repoSnapshots.name, name))));
    const previousCache = old?.etagCache ?? {};
    const cache: Record<string, { etag: string; data: unknown }> = {};
    const request = async (
      route: string,
      params: Record<string, string | number> = {},
    ) => {
      const key = JSON.stringify([route, params]);
      const cached = previousCache[key];
      try {
        const response = await api.request(route, {
          owner,
          repo: name,
          ...params,
          headers: cached ? { "if-none-match": cached.etag } : {},
        });
        if (Number(response.headers["x-ratelimit-remaining"] ?? 5000) < 50)
          throw new LowQuota();
        if (response.headers.etag)
          cache[key] = { etag: response.headers.etag, data: response.data };
        return response.data as unknown;
      } catch (error) {
        const e = error as {
          status?: number;
          response?: { headers?: Record<string, string> };
        };
        if (Number(e.response?.headers?.["x-ratelimit-remaining"] ?? 5000) < 50)
          throw new LowQuota();
        if (e.status === 304 && cached) {
          cache[key] = cached;
          return cached.data;
        }
        throw error;
      }
    };
    try {
      const metadata = repoSchema.parse(
        await request("GET /repos/{owner}/{repo}"),
      );
      let lastCommitAt: Date | null = null,
        lastCommitMsg: string | null = null,
        commits7d = 0;
      try {
        const latest = commitsSchema.parse(
          await request("GET /repos/{owner}/{repo}/commits", { per_page: 1 }),
        );
        lastCommitAt = latest[0]?.commit.committer?.date
          ? new Date(latest[0].commit.committer.date)
          : null;
        lastCommitMsg = latest[0]?.commit.message ?? null;
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        for (let page = 1; ; page++) {
          const commits = commitsSchema.parse(
            await request("GET /repos/{owner}/{repo}/commits", {
              since,
              per_page: 100,
              page,
            }),
          );
          commits7d += commits.length;
          if (commits.length < 100) break;
        }
      } catch (error) {
        if ((error as { status?: number }).status !== 409) throw error;
      }
      let openIssues = 0,
        openPrs = 0;
      // The issues endpoint includes pull requests and uses the core quota.
      for (let page = 1; ; page++) {
        const issues = issuesSchema.parse(
          await request("GET /repos/{owner}/{repo}/issues", {
            state: "open",
            per_page: 100,
            page,
          }),
        );
        for (const issue of issues) {
          if (issue.pull_request) openPrs++;
          else openIssues++;
        }
        if (issues.length < 100) break;
      }
      const values = {
        userId,
        owner,
        name,
        defaultBranch: metadata.default_branch,
        isPrivate: metadata.private,
        lastCommitAt,
        lastCommitMsg,
        commits7d,
        openIssues,
        openPrs,
        fetchedAt: new Date(),
        error: null,
        etagCache: cache,
      };
      await withUserDatabase(userId, (db) => db
        .insert(repoSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [repoSnapshots.userId, repoSnapshots.owner, repoSnapshots.name],
          set: values,
        }));
    } catch (error) {
      if (error instanceof LowQuota) break;
      const status = (error as { status?: number }).status;
      const values = {
        userId,
        owner,
        name,
        error:
          status === 404
            ? "not_found"
            : status === 403
              ? "forbidden"
              : "refresh_failed",
        fetchedAt: new Date(),
        etagCache: cache,
      };
      await withUserDatabase(userId, (db) => db
        .insert(repoSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [repoSnapshots.userId, repoSnapshots.owner, repoSnapshots.name],
          set: values,
        }));
    }
  }
}
