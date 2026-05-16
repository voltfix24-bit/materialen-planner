import * as XLSX from "xlsx";

export type TemplateLine = {
  excel_row_number: number;
  article_number: string | null;
  description: string | null;
  sort_order: number;
  default_quantity: number | null;
  unit: string | null;
  default_used_quantity: number | null;
  default_return_quantity: number | null;
  default_total_quantity: number | null;
  note: string | null;
  excel_category_id: number | null;
  is_section_header: boolean;
  is_blank_or_separator: boolean;
  is_formula_quantity: boolean;
  quantity_formula_text: string | null;
  total_formula_text: string | null;
  formula_references: any | null;
  source_type: "terrevolt" | "liander" | "internal_code" | "section_header" | "unknown";
};

export type TemplateParseResult = {
  sheet_name: string;
  table_name: string | null;
  range: string;
  header_row_index: number; // 0-based
  total_rows: number;
  lines: TemplateLine[];
  warnings: string[];
  counts: {
    article_lines: number;
    section_headers: number;
    formula_lines: number;
    without_category: number;
    internal_codes: number;
  };
};

const HEADER_ALIASES: Record<string, string[]> = {
  article_number: ["artikelnummer", "artikel nr", "artikelnr"],
  description: ["omschrijving", "besteltekst"],
  sort_order: ["volgorde"],
  quantity: ["aantal"],
  unit: ["eenheid", "eh"],
  used: ["verbruikt"],
  ret: ["retour"],
  total: ["totaal"],
  note: ["opmerking"],
  category: ["categorie", "category"],
  excel_id: ["id"],
};

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: any[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (aliases.some((a) => h === a || h.startsWith(a))) return i;
  }
  return -1;
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(",", ".");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function detectSourceType(article: string | null): TemplateLine["source_type"] {
  if (!article) return "section_header";
  const a = article.trim();
  if (/^vdh/i.test(a)) return "vdh";
  if (/^(comp|compr)/i.test(a)) return "internal_code";
  if (/^\d{6,}$/.test(a) && (a.startsWith("200") || a.startsWith("260"))) return "liander";
  return "unknown";
}

function pickSheet(wb: XLSX.WorkBook): { name: string; sheet: XLSX.WorkSheet } | null {
  const preferred = wb.SheetNames.find((n) => /materiaalstaat/i.test(n));
  const name = preferred ?? wb.SheetNames[0];
  if (!name) return null;
  return { name, sheet: wb.Sheets[name] };
}

export async function parseTemplateFile(file: File): Promise<TemplateParseResult> {
  const lower = file.name.toLowerCase();
  if (!/\.(xlsx|xls|xlsm)$/i.test(lower)) {
    throw new Error("Bestandstype niet ondersteund. Gebruik .xlsx, .xls of .xlsm.");
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {
    type: "array",
    cellText: true,
    cellFormula: true,
    cellDates: false,
  });

  const picked = pickSheet(wb);
  if (!picked) throw new Error("Geen tabbladen gevonden in het bestand.");
  const sheet = picked.sheet;

  // Determine range: prefer named table "Tabel1", else fall back to A9:K338, else used range.
  let rangeStr: string | null = null;
  let tableName: string | null = null;
  const wbAny = wb as any;
  const tables = wbAny.Workbook?.Names ?? [];
  for (const nm of tables) {
    if (/tabel1/i.test(nm.Name ?? "") && nm.Ref) {
      // Ref looks like "Materiaalstaat!$A$9:$K$338"
      const m = String(nm.Ref).match(/!?(\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+)/);
      if (m) {
        rangeStr = m[1].replace(/\$/g, "");
        tableName = "Tabel1";
      }
    }
  }
  if (!rangeStr) rangeStr = "A9:K338";

  let rows: any[][] = [];
  try {
    const r = XLSX.utils.decode_range(rangeStr);
    rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true,
      range: r,
    });
  } catch {
    rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true,
    });
  }

  if (rows.length === 0) throw new Error("Geen rijen gevonden in het verwachte bereik.");

  const headers = rows[0] ?? [];
  const idx = {
    article: findColumn(headers, HEADER_ALIASES.article_number),
    description: findColumn(headers, HEADER_ALIASES.description),
    sort: findColumn(headers, HEADER_ALIASES.sort_order),
    qty: findColumn(headers, HEADER_ALIASES.quantity),
    unit: findColumn(headers, HEADER_ALIASES.unit),
    used: findColumn(headers, HEADER_ALIASES.used),
    ret: findColumn(headers, HEADER_ALIASES.ret),
    total: findColumn(headers, HEADER_ALIASES.total),
    note: findColumn(headers, HEADER_ALIASES.note),
    category: findColumn(headers, HEADER_ALIASES.category),
    excel_id: findColumn(headers, HEADER_ALIASES.excel_id),
  };

  if (idx.article < 0 || idx.description < 0) {
    throw new Error("Headerrij niet herkend. Verwacht: Artikelnummer, Omschrijving, ...");
  }

  // Determine the absolute first-data-row in the sheet for cell-address lookups
  const decoded = XLSX.utils.decode_range(rangeStr);
  const headerRowAbs = decoded.s.r; // 0-based row index in sheet
  const colStartAbs = decoded.s.c;

  const warnings: string[] = [];
  const lines: TemplateLine[] = [];
  let articleCount = 0;
  let headerCount = 0;
  let formulaCount = 0;
  let withoutCat = 0;
  let internalCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const sheetRowAbs = headerRowAbs + r; // 0-based
    const excelRowNumber = sheetRowAbs + 1; // 1-based

    const article = row[idx.article] != null ? String(row[idx.article]).trim() : "";
    const description = row[idx.description] != null ? String(row[idx.description]).trim() : "";
    const noteVal = idx.note >= 0 && row[idx.note] != null ? String(row[idx.note]).trim() : "";
    const unitVal = idx.unit >= 0 && row[idx.unit] != null ? String(row[idx.unit]).trim() : "";
    const sortVal = idx.sort >= 0 ? toNumOrNull(row[idx.sort]) : null;
    const excelCatId = idx.excel_id >= 0 ? toNumOrNull(row[idx.excel_id]) : null;

    const qtyRaw = idx.qty >= 0 ? row[idx.qty] : null;
    const usedRaw = idx.used >= 0 ? row[idx.used] : null;
    const retRaw = idx.ret >= 0 ? row[idx.ret] : null;
    const totalRaw = idx.total >= 0 ? row[idx.total] : null;

    // Read formulas via cell address
    const qtyAddr = idx.qty >= 0 ? XLSX.utils.encode_cell({ r: sheetRowAbs, c: colStartAbs + idx.qty }) : null;
    const totalAddr = idx.total >= 0 ? XLSX.utils.encode_cell({ r: sheetRowAbs, c: colStartAbs + idx.total }) : null;
    const qtyCell = qtyAddr ? (sheet[qtyAddr] as XLSX.CellObject | undefined) : undefined;
    const totalCell = totalAddr ? (sheet[totalAddr] as XLSX.CellObject | undefined) : undefined;
    const qtyFormula = qtyCell?.f ? String(qtyCell.f) : null;
    const totalFormula = totalCell?.f ? String(totalCell.f) : null;

    const isAllBlank =
      !article && !description && !noteVal && !unitVal &&
      qtyRaw == null && usedRaw == null && retRaw == null && totalRaw == null;

    if (isAllBlank) {
      lines.push({
        excel_row_number: excelRowNumber,
        article_number: null, description: null, sort_order: sortVal != null ? Math.round(sortVal) : 0,
        default_quantity: null, unit: null,
        default_used_quantity: null, default_return_quantity: null, default_total_quantity: null,
        note: null, excel_category_id: excelCatId != null ? Math.round(excelCatId) : null,
        is_section_header: false, is_blank_or_separator: true,
        is_formula_quantity: false, quantity_formula_text: null, total_formula_text: null,
        formula_references: null, source_type: "section_header",
      });
      continue;
    }

    const isHeader =
      !article &&
      (description || excelCatId != null) &&
      (qtyRaw == null || String(qtyRaw).trim() === "-" || String(qtyRaw).trim() === "");

    if (isHeader) {
      headerCount++;
      lines.push({
        excel_row_number: excelRowNumber,
        article_number: null, description: description || null,
        sort_order: sortVal != null ? Math.round(sortVal) : r,
        default_quantity: null, unit: unitVal || null,
        default_used_quantity: null, default_return_quantity: null, default_total_quantity: null,
        note: noteVal || null,
        excel_category_id: excelCatId != null ? Math.round(excelCatId) : null,
        is_section_header: true, is_blank_or_separator: false,
        is_formula_quantity: false, quantity_formula_text: null, total_formula_text: null,
        formula_references: null, source_type: "section_header",
      });
      continue;
    }

    const sourceType = detectSourceType(article || null);
    if (sourceType === "internal_code") internalCount++;

    const defaultQty = toNumOrNull(qtyRaw);
    const defaultTotal = toNumOrNull(totalRaw);
    const isFormulaQty = !!qtyFormula;
    if (isFormulaQty || totalFormula) formulaCount++;
    if (excelCatId == null) withoutCat++;

    articleCount++;
    lines.push({
      excel_row_number: excelRowNumber,
      article_number: article || null,
      description: description || null,
      sort_order: sortVal != null ? Math.round(sortVal) : r,
      default_quantity: defaultQty,
      unit: unitVal || null,
      default_used_quantity: toNumOrNull(usedRaw),
      default_return_quantity: toNumOrNull(retRaw),
      default_total_quantity: defaultTotal,
      note: noteVal || null,
      excel_category_id: excelCatId != null ? Math.round(excelCatId) : null,
      is_section_header: false,
      is_blank_or_separator: false,
      is_formula_quantity: isFormulaQty,
      quantity_formula_text: qtyFormula,
      total_formula_text: totalFormula,
      formula_references: null,
      source_type: sourceType,
    });
  }

  if (articleCount === 0) warnings.push("Geen artikelregels gevonden in het bereik.");
  if (withoutCat > 0) warnings.push(`${withoutCat} artikelregels hebben geen Categorie-ID.`);

  return {
    sheet_name: picked.name,
    table_name: tableName,
    range: rangeStr,
    header_row_index: headerRowAbs,
    total_rows: rows.length - 1,
    lines,
    warnings,
    counts: {
      article_lines: articleCount,
      section_headers: headerCount,
      formula_lines: formulaCount,
      without_category: withoutCat,
      internal_codes: internalCount,
    },
  };
}
