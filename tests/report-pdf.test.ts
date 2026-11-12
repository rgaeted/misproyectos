import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { pdfSafe, renderReportPdf, totalLine } from "../lib/report-pdf";
import type { Report, ReportDayRow } from "../lib/time";

const base = { projectName: "Sitio de Ana", ownerName: "Ricardo", from: "2026-10-01", to: "2026-10-31" };
const empty: Report = { byTask: [], byDay: [], totalMinutes: 0 };

describe("pdfSafe", () => {
  it("quita los caracteres que la fuente no codifica y colapsa espacios", async () => {
    const helvetica = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(pdfSafe("Login 🚀 ñandú", helvetica)).toBe("Login ñandú");
  });
});

describe("totalLine", () => {
  it("muestra la duración y luego las horas decimales", () => {
    expect(totalLine(750)).toBe("Total: 12 h 30 min (12,5 h)");
  });
});

describe("renderReportPdf", () => {
  it("genera un PDF de una página con un informe vacío", async () => {
    const bytes = await renderReportPdf({ ...base, report: empty });
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("pagina cuando el detalle no cabe en una página", async () => {
    const byDay: ReportDayRow[] = Array.from({ length: 120 }, (_, index) => ({
      date: `2026-10-${String((index % 31) + 1).padStart(2, "0")}`,
      taskKey: `text:Tarea ${index}`,
      task: `Tarea ${index}`,
      minutes: 30,
    }));
    const report: Report = {
      byTask: byDay.map(({ taskKey, task, minutes }) => ({ taskKey, task, minutes })),
      byDay,
      totalMinutes: 120 * 30,
    };
    const bytes = await renderReportPdf({ ...base, report });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it("no lanza error con emojis en una tarea", async () => {
    const task = "Revisión con cliente ✅";
    const report: Report = {
      byTask: [{ taskKey: `text:${task}`, task, minutes: 90 }],
      byDay: [{ date: "2026-10-05", taskKey: `text:${task}`, task, minutes: 90 }],
      totalMinutes: 90,
    };
    await expect(renderReportPdf({ ...base, report })).resolves.toBeInstanceOf(Uint8Array);
  });
});
