import * as XLSX from "xlsx";

export type ParsedRow = {
  article_number: string;
  description: string | null;
  unit: string | null;
  customer_quantity_field_name: string | null;
  raw_data: Record<string, any>;
};

export type DuplicateInfo = {
  article_number: string;
  rows: number[]; // 1-based row numbers in source sheet
};

export type SuspiciousInfo = {
  article_number: string;
  reason: string;
  row: number;
};

export type ParseResult = {
  sheet_name: string;
  header_row_index: number; // 0-based
  total_rows: number;
  rows: ParsedRow[];
  skipped_rows: number;
  warnings: string[];
  column_map: {
    article_number: string;
    description: string | null;
    unit: string | null;
    customer_quantity: string | null;
  };
  duplicates: DuplicateInfo[];
  suspicious: SuspiciousInfo[];
  has_blocking_errors: boolean;
};

const ART_KEYS = ["artikelnummer", "artikel nr", "artikelnr", "article number", "articlenumber", "artikel_number", "artikel"];
const DESC_KEYS = ["omschrijving", "besteltekst", "artikelomschrijving", "description"];
const UNIT_KEYS = ["eenheid", "unit", "eh"];
const UNIT_FALLBACK_KEYS = ["verpakkingseenheid", "verpakking"];
const QTY_KEYS = ["klant hoeveelheid", "klanthoeveelheid", "hoeveelheid", "customer quantity", "customerquantity", "qty"];

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findKey(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const hit = headers.find((h) => norm(h) === c);
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = headers.find((h) => norm(h).includes(c));
    if (hit) return hit;
  }
  return null;
}

/**
 * Normalize a cell into a safe article number string.
 * - never converts to Number
 * - preserves leading zeros (uses formatted text `cell.w` when available)
 * - trims surrounding whitespace
 * - flags scientific notation / decimals as "suspicious"
 */
export function normalizeArticleNumberCell(
  cellValue: any,
  rawCell?: XLSX.CellObject,
): { value: string; suspicious: string | null } {
  // Prefer the cell's formatted text representation when the source was a number/date
  let raw: string;
  if (rawCell && (rawCell.t === "n" || rawCell.t === "d")) {
    // Use formatted text if Excel has one; otherwise stringify the raw v safely
    raw = rawCell.w != null ? String(rawCell.w) : String(rawCell.v ?? "");
  } else if (cellValue == null) {
    raw = "";
  } else {
    raw = String(cellValue);
  }
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", suspicious: null };

  let suspicious: string | null = null;
  // Scientific notation, e.g. 1.23E+12
  if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(trimmed)) {
    suspicious = `Wetenschappelijke notatie: "${trimmed}"`;
  } else if (rawCell && rawCell.t === "n") {
    // Excel had this as a number — risk of lost leading zeros / float precision
    suspicious = `Cel is als getal opgeslagen (mogelijk verlies voorloopnullen): "${trimmed}"`;
  } else if (/^\d+\.\d+$/.test(trimmed)) {
    suspicious = `Artikelnummer met decimaal: "${trimmed}"`;
  } else if (/[^\w\-./]/.test(trimmed)) {
    // anything outside common artikelnr characters
    suspicious = `Vreemde tekens in artikelnummer: "${trimmed}"`;
  }

  return { value: trimmed, suspicious };
}

function detectHeader(rows: any[][]): { idx: number; headers: string[] } | null {
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const row = (rows[i] ?? []).map((v) => String(v ?? "").trim());
    const nonEmpty = row.filter(Boolean);
    if (nonEmpty.length < 2) continue;
    const hasArt = findKey(row, ART_KEYS);
    const hasDesc = findKey(row, DESC_KEYS);
    const hasUnit = findKey(row, UNIT_KEYS) || findKey(row, UNIT_FALLBACK_KEYS);
    if (hasArt && (hasDesc || hasUnit)) return { idx: i, headers: row };
  }
  return null;
}

function pickSheet(wb: XLSX.WorkBook): { name: string; sheet: XLSX.WorkSheet; rows: any[][] } | null {
  const preferred = wb.SheetNames.find((n) => norm(n) === "aanvulling");
  const order = preferred ? [preferred, ...wb.SheetNames.filter((n) => n !== preferred)] : wb.SheetNames;
  for (const name of order) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: true,
    });
    if (detectHeader(rows)) return { name, sheet, rows };
  }
  if (wb.SheetNames[0]) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: true,
    });
    return { name: wb.SheetNames[0], sheet, rows };
  }
  return null;
}

export async function parseLianderFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  if (name.endsWith(".csv")) {
    const text = new TextDecoder().decode(buf);
    wb = XLSX.read(text, { type: "string" });
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) {
    // cellText:true ensures cell.w is populated for numbers/dates
    wb = XLSX.read(buf, { type: "array", cellText: true, cellDates: false });
  } else {
    throw new Error("Bestandstype niet ondersteund. Gebruik .xlsx, .xls of .csv.");
  }

  const picked = pickSheet(wb);
  if (!picked) throw new Error("Geen tabbladen gevonden in het bestand.");

  const detected = detectHeader(picked.rows);
  if (!detected) {
    throw new Error(
      "Geen geldige header gevonden. Verwachte kolommen: Artikelnummer, Omschrijving/Besteltekst en Eenheid.",
    );
  }

  const headers = detected.headers;
  const colMap = {
    article_number: findKey(headers, ART_KEYS)!,
    description: findKey(headers, DESC_KEYS),
    unit: findKey(headers, UNIT_KEYS) ?? findKey(headers, UNIT_FALLBACK_KEYS),
    customer_quantity: findKey(headers, QTY_KEYS),
  };

  const warnings: string[] = [];
  if (!colMap.description) warnings.push("Kolom 'Omschrijving' niet gevonden — omschrijvingen worden leeg geïmporteerd.");
  if (!colMap.unit) warnings.push("Kolom 'Eenheid' niet gevonden — eenheden worden leeg geïmporteerd.");
  if (!colMap.customer_quantity) warnings.push("Kolom 'Klant Hoeveelheid' niet gevonden (alleen informatief).");

  // Find the article column index in the header row, so we can grab the raw cell object
  const artColIdx = headers.findIndex((h) => h === colMap.article_number);

  const dataRows = picked.rows.slice(detected.idx + 1);
  const rows: ParsedRow[] = [];
  const suspicious: SuspiciousInfo[] = [];
  const seen = new Map<string, number[]>(); // article -> source row numbers (1-based)

  let skipped = 0;
  let missingDesc = 0;
  let missingUnit = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (!r || r.every((v) => v === null || v === "")) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, ci) => {
      if (h) obj[h] = r[ci] ?? null;
    });

    // Source row number in the original sheet (1-based, accounting for header offset)
    const sourceRow = detected.idx + 1 /* header */ + i + 1;

    // Look up the raw cell to detect numeric / scientific notation
    const cellAddr = XLSX.utils.encode_cell({ r: sourceRow - 1, c: artColIdx });
    const rawCell = picked.sheet[cellAddr] as XLSX.CellObject | undefined;
    const { value: article, suspicious: susReason } = normalizeArticleNumberCell(
      obj[colMap.article_number],
      rawCell,
    );

    if (!article) {
      skipped++;
      continue;
    }
    if (susReason) {
      suspicious.push({ article_number: article, reason: susReason, row: sourceRow });
    }

    // Track duplicates within this file
    const arr = seen.get(article);
    if (arr) arr.push(sourceRow);
    else seen.set(article, [sourceRow]);

    const desc = colMap.description ? (obj[colMap.description] ?? null) : null;
    const unit = colMap.unit ? (obj[colMap.unit] ?? null) : null;
    if (!desc) missingDesc++;
    if (!unit) missingUnit++;

    // Force article_number string in the row payload too
    obj[colMap.article_number] = article;

    rows.push({
      article_number: article,
      description: desc !== null ? String(desc).trim() || null : null,
      unit: unit !== null ? String(unit).trim() || null : null,
      customer_quantity_field_name: colMap.customer_quantity,
      raw_data: obj,
    });
  }

  const duplicates: DuplicateInfo[] = [];
  for (const [art, rs] of seen.entries()) {
    if (rs.length > 1) duplicates.push({ article_number: art, rows: rs });
  }

  if (missingDesc > 0) warnings.push(`${missingDesc} regel(s) zonder omschrijving.`);
  if (missingUnit > 0) warnings.push(`${missingUnit} regel(s) zonder eenheid.`);
  if (skipped > 0) warnings.push(`${skipped} regel(s) overgeslagen wegens ontbrekend artikelnummer.`);
  if (suspicious.length > 0) {
    warnings.push(
      `${suspicious.length} verdacht artikelnummer(s) gedetecteerd — controleer formattering in Excel (bijv. cellen als Tekst opmaken).`,
    );
  }
  if (duplicates.length > 0) {
    warnings.push(
      `${duplicates.length} dubbele artikelnummer(s) in bestand: ${duplicates
        .slice(0, 5)
        .map((d) => d.article_number)
        .join(", ")}${duplicates.length > 5 ? " …" : ""}`,
    );
  }

  return {
    sheet_name: picked.name,
    header_row_index: detected.idx,
    total_rows: dataRows.length,
    rows,
    skipped_rows: skipped,
    warnings,
    column_map: colMap,
    duplicates,
    suspicious,
    has_blocking_errors: duplicates.length > 0 || rows.length === 0,
  };
}
