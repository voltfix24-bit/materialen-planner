import * as XLSX from "xlsx";

export type ParsedRow = {
  article_number: string;
  description: string | null;
  unit: string | null;
  customer_quantity_field_name: string | null;
  raw_data: Record<string, any>;
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
  // partial match
  for (const c of candidates) {
    const hit = headers.find((h) => norm(h).includes(c));
    if (hit) return hit;
  }
  return null;
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
    if (hasArt && (hasDesc || hasUnit)) {
      return { idx: i, headers: row };
    }
  }
  return null;
}

function pickSheet(wb: XLSX.WorkBook): { name: string; rows: any[][] } | null {
  // Prefer "Aanvulling"
  const preferred = wb.SheetNames.find((n) => norm(n) === "aanvulling");
  const order = preferred ? [preferred, ...wb.SheetNames.filter((n) => n !== preferred)] : wb.SheetNames;
  for (const name of order) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: null });
    if (detectHeader(rows)) return { name, rows };
  }
  // No header anywhere — return first sheet for error reporting
  if (wb.SheetNames[0]) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: null });
    return { name: wb.SheetNames[0], rows };
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
    wb = XLSX.read(buf, { type: "array" });
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

  const dataRows = picked.rows.slice(detected.idx + 1);
  const rows: ParsedRow[] = [];
  let skipped = 0;
  let missingDesc = 0;
  let missingUnit = 0;

  for (const r of dataRows) {
    if (!r || r.every((v) => v === null || v === "")) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = r[i] ?? null;
    });
    const article = String(obj[colMap.article_number] ?? "").trim();
    if (!article) {
      skipped++;
      continue;
    }
    const desc = colMap.description ? (obj[colMap.description] ?? null) : null;
    const unit = colMap.unit ? (obj[colMap.unit] ?? null) : null;
    if (!desc) missingDesc++;
    if (!unit) missingUnit++;
    rows.push({
      article_number: article,
      description: desc !== null ? String(desc).trim() || null : null,
      unit: unit !== null ? String(unit).trim() || null : null,
      customer_quantity_field_name: colMap.customer_quantity,
      raw_data: obj,
    });
  }

  if (missingDesc > 0) warnings.push(`${missingDesc} regel(s) zonder omschrijving.`);
  if (missingUnit > 0) warnings.push(`${missingUnit} regel(s) zonder eenheid.`);
  if (skipped > 0) warnings.push(`${skipped} regel(s) overgeslagen wegens ontbrekend artikelnummer.`);

  return {
    sheet_name: picked.name,
    header_row_index: detected.idx,
    total_rows: dataRows.length,
    rows,
    skipped_rows: skipped,
    warnings,
    column_map: colMap,
  };
}
