import { getBoard } from "@/lib/data";
import { Workspace } from "@/components/Workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  return <Workspace initial={await getBoard()} />;
}
