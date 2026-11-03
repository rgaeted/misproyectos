import { getBoard } from "@/lib/data";
import { Workspace } from "@/components/Workspace";
import { notFound } from "next/navigation";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getBoard();
  if (!data.projects.some((p) => p.id === id)) notFound();
  return <Workspace initial={data} selectedId={id} />;
}
