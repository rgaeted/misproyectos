import { getBoard } from "@/lib/data";
import { Workspace } from "@/components/Workspace";
import { requireUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireUser();
  return <Workspace initial={await getBoard(user.id!)} viewerName={user.name || "Mi cuenta"} />;
}
