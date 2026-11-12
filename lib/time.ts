export type TimeEntry = {
  id: string;
  projectId: string;
  stepId: string | null;
  taskText: string;
  startedAt: string;
  endedAt: string | null;
};
