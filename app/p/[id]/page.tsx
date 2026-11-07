import { getBoard } from "@/lib/data";
import { Workspace } from "@/components/Workspace";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getUfToday } from "@/lib/uf";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [data, ufToday] = await Promise.all([getBoard(user.id!), getUfToday()]);
  if (!data.projects.some((p) => p.id === id)) notFound();
  return <Workspace initial={data} selectedId={id} viewerName={user.name || "Mi cuenta"} ufToday={ufToday} />;
}
