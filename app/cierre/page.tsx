import { getBoard } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { todayInChile } from "@/lib/payments";
import { daySummary, draftForTomorrow } from "@/lib/day";
import { DayClose } from "@/components/DayClose";
export const dynamic = "force-dynamic";
export default async function CierrePage() {
  const user = await requireUser();
  const board = await getBoard(user.id!);
  const today = todayInChile();
  const extraSteps = board.projects
    .filter((project) => !project.archived)
    .flatMap((project) => project.steps
      .filter((step) => step.state === "todo")
      .map((step) => ({ stepId: step.id, projectName: project.name, text: step.text })));
  return <DayClose
    summary={daySummary(board.projects, board.dayList, today)}
    draft={draftForTomorrow(board.projects, board.dayList, today)}
    extraSteps={extraSteps}
  />;
}
