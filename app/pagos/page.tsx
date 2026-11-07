import { getBoard } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { getUfToday } from "@/lib/uf";
import { paymentsOverview, todayInChile } from "@/lib/payments";
import { PaymentsOverview } from "@/components/PaymentsOverview";
export const dynamic = "force-dynamic";
export default async function PaymentsPage() {
  const user = await requireUser();
  const [board, ufToday] = await Promise.all([getBoard(user.id!), getUfToday()]);
  const today = todayInChile();
  return <PaymentsOverview overview={paymentsOverview(board.projects, today)} ufToday={ufToday} year={today.slice(0, 4)} />;
}
