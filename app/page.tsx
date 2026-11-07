import { getBoard } from "@/lib/data";
import { Workspace } from "@/components/Workspace";
import { requireUser } from "@/lib/session";
import { getUfToday } from "@/lib/uf";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireUser();
  const [board, ufToday] = await Promise.all([getBoard(user.id!), getUfToday()]);
  return <Workspace initial={board} viewerName={user.name || "Mi cuenta"} ufToday={ufToday} />;
}
