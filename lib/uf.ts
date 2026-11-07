import "server-only";
import { unstable_cache } from "next/cache";

export function parseUfResponse(json: unknown): number | null {
  const serie = (json as { serie?: unknown } | null)?.serie;
  if (!Array.isArray(serie)) return null;
  const value = (serie[0] as { valor?: unknown } | undefined)?.valor;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export async function fetchUf(date?: string): Promise<number | null> {
  try {
    const url = date
      ? `https://mindicador.cl/api/uf/${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`
      : "https://mindicador.cl/api/uf";
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    return parseUfResponse(await response.json());
  } catch {
    return null;
  }
}

// El caché no guarda las excepciones: así una falla de la API no se queda 6 horas.
const cachedUf = unstable_cache(async () => {
  const value = await fetchUf();
  if (value === null) throw new Error("uf_unavailable");
  return value;
}, ["uf-today"], { revalidate: 21600 });
export async function getUfToday(): Promise<number | null> {
  try {
    return await cachedUf();
  } catch {
    return null;
  }
}
