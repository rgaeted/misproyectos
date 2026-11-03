import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAllowedLogin } from "./lib/access";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    signIn({ profile }) {
      return isAllowedLogin(profile?.login, process.env.ALLOWED_GITHUB_LOGIN);
    },
  },
});
