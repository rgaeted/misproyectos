import "server-only";
import { eq } from "drizzle-orm";
import { database } from "./db";
import { users } from "./db/schema";
import { decryptToken } from "./token-storage";
export async function githubTokenForUser(userId: string) {
  const [user] = await database().select({ token: users.githubToken }).from(users).where(eq(users.id, userId));
  if (!user?.token) return null;
  try { return decryptToken(user.token); } catch { return null; }
}
