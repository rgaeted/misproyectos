export type DayItem = {
  id: string; stepId: string | null; projectId: string | null; projectName: string | null;
  text: string; done: boolean; doneAt: string | null;
};
export type DayList = { confirmedAt: string; items: DayItem[] };
