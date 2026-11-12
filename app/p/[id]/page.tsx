import { getBoard } from "@/lib/data";
import { Workspace } from "@/components/Workspace";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getUfToday } from "@/lib/uf";
import { getTimeEntries } from "@/lib/time-data";
import { startOfChileDay } from "@/lib/time";
import { addDays } from "@/lib/day";
import { todayInChile } from "@/lib/payments";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [data, ufToday, timeEntries] = await Promise.all([
    getBoard(user.id!),
    getUfToday(),
    getTimeEntries(user.id!, id, startOfChileDay(addDays(todayInChile(), -29)), new Date(Date.now() + 1)),
  ]);
  if (!data.projects.some((p) => p.id === id)) notFound();
  return <Workspace initial={data} selectedId={id} viewerName={user.name || "Mi cuenta"} ufToday={ufToday} timeEntries={timeEntries} />;
}
