import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isUserId } from "./access";
export async function requireUser() {
  const session = await auth();
  if (!session?.user || !isUserId(session.user.id)) redirect("/login");
  return session.user;
}
