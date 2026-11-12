import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isUserId } from "@/lib/access";
import { addDays } from "@/lib/day";
import { withUserDatabase } from "@/lib/db";
import { projects, projectSteps } from "@/lib/db/schema";
import { renderReportPdf } from "@/lib/report-pdf";
import { buildReport, startOfChileDay } from "@/lib/time";
import { getTimeEntries } from "@/lib/time-data";
import { dateString } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_RANGE_DAYS = 366;

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "proyecto";
}

function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!isUserId(userId)) return plain("Inicia sesión para descargar el informe.", 401);

  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const desde = dateString.safeParse(search.get("desde"));
  const hasta = dateString.safeParse(search.get("hasta"));
  if (!desde.success || !hasta.success) return plain("Indica fechas válidas en desde y hasta (AAAA-MM-DD).", 400);
  const from = desde.data;
  const to = hasta.data;
  if (from > to) return plain("La fecha desde debe ser anterior o igual a la fecha hasta.", 400);
  if (rangeDays(from, to) > MAX_RANGE_DAYS) return plain(`El período puede tener hasta ${MAX_RANGE_DAYS} días.`, 400);

  const loaded = await withUserDatabase(userId, async (db) => {
    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (!project) return null;
    const steps = await db
      .select({ id: projectSteps.id, text: projectSteps.text })
      .from(projectSteps)
      .where(eq(projectSteps.projectId, project.id))
      .orderBy(asc(projectSteps.position));
    return { project, steps };
  });
  if (!loaded) return plain("No encontramos ese proyecto.", 404);

  const entries = await getTimeEntries(userId, id, startOfChileDay(from), startOfChileDay(addDays(to, 1)));
  const report = buildReport(entries, loaded.steps, from, to, new Date());
  const pdf = await renderReportPdf({
    projectName: loaded.project.name,
    ownerName: session?.user?.name || "Mi cuenta",
    from,
    to,
    report,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe-${slugify(loaded.project.name)}-${from}-${to}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
