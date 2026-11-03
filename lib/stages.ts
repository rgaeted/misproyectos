export const stages = [
  "idea",
  "explorando",
  "en_desarrollo",
  "en_ejecucion",
  "en_pausa",
] as const;
export type Stage = (typeof stages)[number];
export const labels: Record<Stage, string> = {
  idea: "Idea",
  explorando: "Explorando",
  en_desarrollo: "En desarrollo",
  en_ejecucion: "En ejecución",
  en_pausa: "En pausa",
};
export const colors: Record<Stage, string> = {
  idea: "var(--s-idea)",
  explorando: "var(--s-explorando)",
  en_desarrollo: "var(--s-desarrollo)",
  en_ejecucion: "var(--s-ejecucion)",
  en_pausa: "var(--s-pausa)",
};
export const STALE_DAYS = 14;
export function staleDays(
  stage: Stage | null,
  dates: (string | null)[],
  now = Date.now(),
) {
  if (!["en_desarrollo", "en_ejecucion"].includes(stage ?? "")) return null;
  const valid = dates
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
    .filter(Number.isFinite);
  if (!valid.length) return null;
  const days = Math.floor((now - Math.max(...valid)) / 86400000);
  return days > STALE_DAYS ? days : null;
}
