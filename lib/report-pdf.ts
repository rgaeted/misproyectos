import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { displayDate } from "./payments";
import { formatDuration, formatHoursDecimal, type Report } from "./time";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 10;
const LINE_HEIGHT = 13;
const CELL_PADDING = 4;
const COLUMN_GAP = 10;

const ACCENT = rgb(0.055, 0.431, 0.404);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.85, 0.85, 0.85);

// Quita los caracteres que la fuente no codifica (por ejemplo, emojis) y colapsa espacios.
export function pdfSafe(text: string, font: PDFFont): string {
  let kept = "";
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) {
      kept += " ";
      continue;
    }
    try {
      font.encodeText(ch);
      kept += ch;
    } catch {
      // carácter no imprimible con esta fuente
    }
  }
  return kept.replace(/ {2,}/g, " ").trim();
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    // Una palabra más ancha que la columna se corta por caracteres.
    let rest = word;
    while (!fits(rest)) {
      let cut = 1;
      while (cut < rest.length && fits(rest.slice(0, cut + 1))) cut++;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

type Column = { title: string; width: number; align: "left" | "right" };

class Writer {
  page!: PDFPage;
  y = 0;

  constructor(private doc: PDFDocument, readonly regular: PDFFont, readonly bold: PDFFont) {
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  fits(height: number) {
    return this.y - height >= MARGIN;
  }

  text(value: string, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const font = options.font ?? this.regular;
    const size = options.size ?? BODY_SIZE;
    const lines = wrapText(pdfSafe(value, font), font, size, CONTENT_WIDTH);
    for (const line of lines) {
      if (!this.fits(size * 1.3)) this.addPage();
      this.y -= size;
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color: options.color ?? INK });
      this.y -= size * 0.3;
    }
    this.y -= options.gap ?? 0;
  }

  private rowHeight(lines: number) {
    return lines * LINE_HEIGHT + CELL_PADDING * 2;
  }

  private drawRow(columns: Column[], cells: string[][], font: PDFFont, color: ReturnType<typeof rgb>, rule: ReturnType<typeof rgb>, ruleWidth: number) {
    const height = this.rowHeight(Math.max(...cells.map((lines) => lines.length)));
    let x = MARGIN;
    columns.forEach((column, index) => {
      cells[index].forEach((line, lineIndex) => {
        const lineWidth = font.widthOfTextAtSize(line, BODY_SIZE);
        this.page.drawText(line, {
          x: column.align === "right" ? x + column.width - lineWidth : x,
          y: this.y - CELL_PADDING - BODY_SIZE - lineIndex * LINE_HEIGHT,
          size: BODY_SIZE,
          font,
          color,
        });
      });
      x += column.width + COLUMN_GAP;
    });
    this.y -= height;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: ruleWidth,
      color: rule,
    });
  }

  private headerCells(columns: Column[]) {
    return columns.map((column) => [pdfSafe(column.title, this.bold)]);
  }

  private bodyCells(columns: Column[], row: string[]) {
    return columns.map((column, index) => wrapText(pdfSafe(row[index], this.regular), this.regular, BODY_SIZE, column.width));
  }

  table(title: string, columns: Column[], rows: string[][]) {
    const headerHeight = this.rowHeight(1);
    const titleHeight = 12 * 1.3 + 6;
    const firstRow = rows.length ? this.rowHeight(Math.max(...this.bodyCells(columns, rows[0]).map((l) => l.length))) : 0;
    // El título de la tabla no queda solo al pie de una página.
    if (!this.fits(titleHeight + headerHeight + firstRow)) this.addPage();
    this.text(title, { font: this.bold, size: 12, gap: 6 });
    this.drawRow(columns, this.headerCells(columns), this.bold, ACCENT, ACCENT, 1);
    for (const row of rows) {
      const cells = this.bodyCells(columns, row);
      if (!this.fits(this.rowHeight(Math.max(...cells.map((lines) => lines.length))))) {
        this.addPage();
        this.drawRow(columns, this.headerCells(columns), this.bold, ACCENT, ACCENT, 1);
      }
      this.drawRow(columns, cells, this.regular, INK, RULE, 0.5);
    }
  }
}

export function totalLine(minutes: number): string {
  return `Total: ${formatDuration(minutes)} (${formatHoursDecimal(minutes)})`;
}

export async function renderReportPdf(input: {
  projectName: string;
  ownerName: string;
  from: string;
  to: string;
  report: Report;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Informe de horas - ${input.projectName}`);
  doc.setAuthor(input.ownerName);
  doc.setCreator("Mis proyectos");
  doc.setProducer("Mis proyectos");
  doc.setLanguage("es-CL");
  const writer = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const { report } = input;

  writer.text("Informe de horas", { font: writer.bold, size: 20, color: ACCENT, gap: 8 });
  writer.text(input.projectName, { font: writer.bold, size: 14, gap: 4 });
  writer.text(`Período: ${displayDate(input.from)} al ${displayDate(input.to)}`, { color: MUTED });
  writer.text(`Preparado por ${input.ownerName}`, { color: MUTED, gap: 20 });

  if (report.totalMinutes === 0) {
    writer.text("No hay tiempo registrado en este período.");
    return doc.save();
  }

  const hoursWidth = 80;
  writer.table(
    "Resumen por tarea",
    [
      { title: "Tarea", width: CONTENT_WIDTH - hoursWidth - COLUMN_GAP, align: "left" },
      { title: "Horas", width: hoursWidth, align: "right" },
    ],
    report.byTask.map((row) => [row.task, formatDuration(row.minutes)]),
  );
  writer.y -= 8;
  writer.text(totalLine(report.totalMinutes), { font: writer.bold, gap: 24 });

  const dateWidth = 70;
  writer.table(
    "Detalle por día",
    [
      { title: "Fecha", width: dateWidth, align: "left" },
      { title: "Tarea", width: CONTENT_WIDTH - dateWidth - hoursWidth - COLUMN_GAP * 2, align: "left" },
      { title: "Horas", width: hoursWidth, align: "right" },
    ],
    report.byDay.map((row) => [displayDate(row.date), row.task, formatDuration(row.minutes)]),
  );

  return doc.save();
}
