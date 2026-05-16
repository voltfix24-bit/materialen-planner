// CSV-formaat config — frontend mirror van edge function CSV_CONFIG.
// Houd dit synchroon met supabase/functions/export-verkooporder-csv/index.ts.
// Bij elke wijziging aan separator / line_ending / decimal_separator / headers
// MOET CSV_CONFIG_VERSION ook hier én in de edge function meeverhoogd worden.
export const CSV_CONFIG_VERSION = "verkooporder_csv_v1";

export const CSV_CONFIG: {
  separator: string;
  include_header: boolean;
  encoding: string;
  decimal_separator: string;
  line_ending: string;
  quote_values: boolean;
  file_name_pattern: string;
} = {
  separator: ",",
  include_header: true,
  encoding: "UTF-8",
  decimal_separator: ".",
  line_ending: "\r\n",
  quote_values: false,
  file_name_pattern: "Case {case_number}.csv",
};

export const CSV_HEADERS = [
  "sol_articlenumber",
  "sol_quantity",
  "so_number",
  "so_customernumber",
  "so_project",
] as const;

export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  const sep = CSV_CONFIG.separator;
  if (CSV_CONFIG.quote_values) return `"${s.replace(/"/g, '""')}"`;
  const needsQuote =
    s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r");
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

export function formatNumber(n: number | string): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  const s = String(num);
  return CSV_CONFIG.decimal_separator === ","
    ? s.replace(".", ",")
    : s;
}

export function buildCsv(rows: any[]): string {
  const out: string[] = [];
  if (CSV_CONFIG.include_header)
    out.push(CSV_HEADERS.join(CSV_CONFIG.separator));
  for (const r of rows) {
    out.push(
      [
        csvEscape(r.sol_articlenumber),
        formatNumber(r.sol_quantity),
        csvEscape(r.so_number),
        csvEscape(r.so_customernumber),
        csvEscape(r.so_project),
      ].join(CSV_CONFIG.separator),
    );
  }
  return out.join(CSV_CONFIG.line_ending) + CSV_CONFIG.line_ending;
}

export function fileName(caseNumber: string | null | undefined): string {
  return CSV_CONFIG.file_name_pattern.replace(
    "{case_number}",
    String(caseNumber ?? ""),
  );
}

// --- CSV parsing voor referentie-vergelijking ---
// Robuust genoeg voor Excel-export: auto-detect separator (",", ";", "\t"),
// herkent quoted velden met "" escapes, negeert lege regels.
export function detectSeparator(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((l) => l.length > 0) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const sep of candidates) {
    const count = firstLine.split(sep).length;
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

export function detectLineEnding(text: string): "\r\n" | "\n" | "\r" | "?" {
  if (text.includes("\r\n")) return "\r\n";
  if (text.includes("\n")) return "\n";
  if (text.includes("\r")) return "\r";
  return "?";
}

export function parseCsv(
  text: string,
  separator?: string,
): { headers: string[]; rows: string[][]; separator: string } {
  const sep = separator ?? detectSeparator(text);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    cur.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(cur);
    cur = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) pushField();
      else if (c === "\r") {
        // peek lf
        if (text[i + 1] === "\n") i++;
        pushField();
        pushRow();
      } else if (c === "\n") {
        pushField();
        pushRow();
      } else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    pushField();
    pushRow();
  }
  // strip volledig lege regels
  const cleaned = rows.filter(
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  const headers = cleaned[0]?.map((h) => h.trim()) ?? [];
  const dataRows = cleaned.slice(1);
  return { headers, rows: dataRows, separator: sep };
}
