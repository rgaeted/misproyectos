import Link from "next/link";
import { AuthForm } from "./AuthForm";
import { loginWithGithub } from "@/lib/auth-actions";
export function AuthPage({ mode, error }: { mode: "login" | "register"; error?: string }) {
  const signup = mode === "register";
  return <main className="auth-page"><section className="auth-card">
    <Link href="/login" className="brand"><span className="brand-mark">mp</span> Mis proyectos</Link>
    <p className="eyebrow">Cada idea tiene su lugar</p>
    <h1>{signup ? "Tu propio espacio" : "Vuelve a tus proyectos"}</h1>
    <p className="muted">{signup ? "Crea tu cuenta y empieza con un tablero privado, solo para ti." : "Entra con el mismo método con el que creaste tu cuenta."}</p>
    {error && <p role="alert" className="auth-error">No pudimos completar el acceso. Inténtalo de nuevo con el método de tu cuenta.</p>}
    <form action={loginWithGithub}><button className="auth-github">Continuar con GitHub</button></form>
    <div className="auth-separator">o con tu correo</div>
    <AuthForm mode={mode} />
    <p className="auth-switch">{signup ? "¿Ya tienes una cuenta? " : "¿Primera vez aquí? "}<Link href={signup ? "/login" : "/register"}>{signup ? "Iniciar sesión" : "Crear una cuenta"}</Link></p>
  </section></main>;
}
