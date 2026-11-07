import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { isUserId } from "./lib/access";
import { credentialsSchema } from "./lib/credentials";
import { database } from "./lib/db";
import { users } from "./lib/db/schema";
import { verifyPassword } from "./lib/passwords";
import { allowAttempt, clientAddress } from "./lib/rate-limit";
import { encryptToken } from "./lib/token-storage";
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GitHub({ issuer: "https://github.com/login/oauth" }),
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(input, request) {
        const parsed = credentialsSchema.safeParse(input);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ipAllowed = await allowAttempt("login-ip", clientAddress(request.headers), 30, 900);
        const emailAllowed = await allowAttempt("login-email", email, 10, 900);
        if (!ipAllowed || !emailAllowed) return null;
        const [user] = await database().select().from(users).where(eq(users.email, email));
        const valid = await verifyPassword(password, user?.passwordHash);
        if (!user || !valid) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "github") {
        if (!/^\d+$/.test(account.providerAccountId)) throw new Error("invalid_github_id");
        const name = user.name || "Mi cuenta";
        const githubLogin = typeof profile?.login === "string" ? profile.login : null;
        const tokenData = account.access_token ? { githubToken: encryptToken(account.access_token) } : {};
        const [record] = await database().insert(users).values({
          name, githubId: account.providerAccountId, githubLogin, ...tokenData,
        }).onConflictDoUpdate({ target: users.githubId, set: { name, githubLogin, ...tokenData } })
          .returning({ id: users.id });
        token.userId = record.id;
      } else if (account?.provider === "credentials" && isUserId(user?.id)) {
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = isUserId(token.userId) ? token.userId : "";
      return session;
    },
  },
});
