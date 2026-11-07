"use server";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { database } from "./db";
import { users } from "./db/schema";
import { registrationSchema, credentialsSchema } from "./credentials";
import { hashPassword } from "./passwords";
import { allowAttempt, clientAddress } from "./rate-limit";
export type AuthState = { error: string };
export async function login(_state: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Correo o contraseña incorrectos. Si hiciste varios intentos, espera 15 minutos." };
    throw error;
  }
  return { error: "" };
}
export async function register(_state: AuthState, form: FormData): Promise<AuthState> {
  const parsed = registrationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;
  try {
    if (!(await allowAttempt("register-ip", clientAddress(await headers()), 5, 3600)))
      return { error: "Se hicieron varios registros desde esta conexión. Inténtalo más tarde." };
    const [created] = await database().insert(users).values({ name, email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: users.email }).returning({ id: users.id });
    if (!created) return { error: "No pudimos crear la cuenta. Si ya tienes una, inicia sesión." };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    console.error("account_registration_failed", { code: cause?.code || "registration_failed" });
    return { error: "No pudimos crear tu cuenta. Inténtalo de nuevo en unos segundos." };
  }
  return login({ error: "" }, form);
}
export async function loginWithGithub() {
  await signIn("github", { redirectTo: "/" });
}
export async function logout() {
  await signOut({ redirectTo: "/login" });
}
