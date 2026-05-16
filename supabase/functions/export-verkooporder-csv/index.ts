// Edge function: export verkooporder as CSV.
// Bron = case_order_lines (Aanvulling). Rebuild gebeurt server-side via
// public.rebuild_verkooporder_lines voordat de CSV wordt opgebouwd, zodat
// CSV nooit afhankelijk is van verouderde frontend state.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// CSV-formaat config — één centrale plek.
// Frontend mirror staat in src/lib/csv-config.ts.
// Bij wijziging hier MOET CSV_CONFIG_VERSION in beide bestanden meeverhoogd worden.
const CSV_CONFIG_VERSION = "verkooporder_csv_v1";
const CSV_CONFIG = {
  separator: ",",
  include_header: true,
  encoding: "UTF-8",
  decimal_separator: ".",
  line_ending: "\r\n",
  quote_values: false,
  file_name_pattern: "Case {case_number}.csv",
};

const CSV_HEADERS = [
  "sol_articlenumber",
  "sol_quantity",
  "so_number",
  "so_customernumber",
  "so_project",
];

const CSV_HEADER_LINE = CSV_HEADERS.join(CSV_CONFIG.separator);
const CSV_CONFIG_SNAPSHOT = { ...CSV_CONFIG, version: CSV_CONFIG_VERSION, headers: CSV_HEADERS };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  const sep = CSV_CONFIG.separator;
  if (CSV_CONFIG.quote_values) return `"${s.replace(/"/g, '""')}"`;
  const needsQuote =
    s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r");
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatNumber(n: number | string): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  const s = String(num);
  return CSV_CONFIG.decimal_separator === "," ? s.replace(".", ",") : s;
}

function buildCsv(rows: any[]): string {
  const out: string[] = [];
  if (CSV_CONFIG.include_header) out.push(CSV_HEADERS.join(CSV_CONFIG.separator));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let case_id: string | undefined;
  let intendedFileName: string | null = null;

  const logFailure = async (message: string) => {
    try {
      await supabase.from("export_logs").insert({
        case_id: case_id ?? null,
        export_type: "verkooporder_csv",
        file_name: intendedFileName,
        row_count: 0,
        status: "failed",
        error_message: message,
        exported_by: "system",
      });
    } catch (_) {
      // swallow logging failure
    }
  };

  try {
    const body = await req.json();
    case_id = body?.case_id;
    if (!case_id || typeof case_id !== "string") {
      return json({ error: "case_id is required" }, 400);
    }

    // 1. Lees case voor bestandsnaam en validatie
    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select(
        "id, case_number, so_number, so_customernumber, so_project, last_aanvulling_rebuild_at, last_material_change_at",
      )
      .eq("id", case_id)
      .single();
    if (caseErr) throw caseErr;

    intendedFileName = CSV_CONFIG.file_name_pattern.replace(
      "{case_number}",
      String(caseRow.case_number ?? case_id),
    );

    // 2. Server-side rebuild vanuit Aanvulling (case_order_lines)
    const { data: rebuildResult, error: rebuildErr } = await supabase.rpc(
      "rebuild_verkooporder_lines",
      { p_case_id: case_id },
    );
    if (rebuildErr) throw rebuildErr;

    const result = rebuildResult as any;
    if (!result?.success) {
      const code = result?.error ?? "unknown";
      const msgMap: Record<string, string> = {
        case_not_found: "Case niet gevonden.",
        missing_verkooporder_settings: `Vul eerst de verkooporder instellingen in (${(result?.missing ?? []).join(", ")}).`,
        no_aanvulling:
          "Bouw eerst Aanvulling op voordat je Verkooporder exporteert.",
        aanvulling_stale:
          "Aanvulling is verouderd. Bouw eerst Aanvulling opnieuw op.",
        no_exportable_lines:
          "Geen exporteerbare regels in de Aanvulling (alle hoeveelheden 0 of artikelnummers ontbreken).",
      };
      const msg = msgMap[code] ?? result?.message ?? `Export geblokkeerd (${code}).`;
      await logFailure(msg);
      return json(
        {
          error: msg,
          code,
          missing: result?.missing,
        },
        400,
      );
    }

    // 3. Lees opgebouwde verkooporder_lines voor CSV
    const { data: rows, error: rowsErr } = await supabase
      .from("verkooporder_lines")
      .select(
        "sol_articlenumber, sol_quantity, so_number, so_customernumber, so_project",
      )
      .eq("case_id", case_id)
      .order("sol_articlenumber");
    if (rowsErr) throw rowsErr;

    if (!rows || rows.length === 0) {
      const msg = "Geen verkooporderregels na rebuild.";
      await logFailure(msg);
      return json({ error: msg }, 400);
    }

    // 4. CSV bouwen
    const csv = buildCsv(rows);

    // 5. Log success
    await supabase.from("export_logs").insert({
      case_id,
      export_type: "verkooporder_csv",
      file_name: intendedFileName,
      row_count: rows.length,
      status: "success",
      exported_by: "system",
    });

    // 6. Case bijwerken
    const now = new Date().toISOString();
    await supabase
      .from("cases")
      .update({
        status: "geexporteerd",
        last_exported_at: now,
        export_stale: false,
      })
      .eq("id", case_id);

    return json({
      csv,
      file_name: intendedFileName,
      row_count: rows.length,
      rebuild: result,
      csv_config: CSV_CONFIG,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "Onbekende fout bij export.";
    console.error(e);
    await logFailure(msg);
    return json({ error: msg }, 500);
  }
});
