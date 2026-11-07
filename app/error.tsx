"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <h1>No pudimos cargar tus proyectos</h1>
      <p>
        No pudimos completar la carga. Vuelve a intentarlo en unos segundos.
      </p>
      <button onClick={reset}>Intentar de nuevo</button>
    </main>
  );
}
