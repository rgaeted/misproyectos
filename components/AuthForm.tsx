"use client";
import { useActionState, useState } from "react";
import { login, register } from "@/lib/auth-actions";
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const signup = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(signup ? register : login, { error: "" });
  return <form action={action} className="auth-form">
    {signup && <label>Nombre<input name="name" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>}
    <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Contraseña<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 12 : 1} maxLength={128} aria-describedby={signup ? "password-help" : undefined} /></label>
    {signup && <><p id="password-help" className="muted">Al menos 12 caracteres. Puedes usar una frase.</p><label>Repite la contraseña<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label></>}
    {state.error && <p role="alert" className="auth-error">{state.error}</p>}
    <button className="primary" disabled={pending}>{pending ? "Un momento…" : signup ? "Crear mi cuenta" : "Entrar"}</button>
  </form>;
}
