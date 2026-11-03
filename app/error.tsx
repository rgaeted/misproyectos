"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <h1>No pudimos cargar tus proyectos</h1>
      <p>
        Revisa la conexión a PostgreSQL y la configuración de la aplicación.
        Luego vuelve a intentarlo.
      </p>
      <button onClick={reset}>Intentar de nuevo</button>
    </main>
  );
}
