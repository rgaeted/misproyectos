export const stepStates = ["todo", "waiting", "done"] as const;
export type StepState = (typeof stepStates)[number];
export const stepLabels: Record<StepState, string> = {
  todo: "Por trabajar",
  waiting: "En espera",
  done: "Completado",
};
export function completedAtFor(previous: StepState | null, next: StepState, current: Date | null, now: Date): Date | null {
  if (next !== "done") return null;
  return previous === "done" ? (current ?? now) : now;
}
export function stepSummary<T extends { state: StepState }>(steps: readonly T[]) {
  return {
    todo: steps.filter((step) => step.state === "todo").length,
    waiting: steps.filter((step) => step.state === "waiting").length,
    done: steps.filter((step) => step.state === "done").length,
    pending: steps.filter((step) => step.state !== "done"),
  };
}
