// Edge function: export verkooporder as CSV with auto-rebuild + safety guards
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    // 1. Validate case + SO settings
    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("id, case_number, so_number, so_customernumber, so_project")
      .eq("id", case_id)
      .single();
    if (caseErr) throw caseErr;

    intendedFileName = `Case ${caseRow.case_number ?? case_id}.csv`;

    const missing: string[] = [];
    if (!caseRow.so_number) missing.push("so_number");
    if (!caseRow.so_customernumber) missing.push("so_customernumber");
    if (!caseRow.so_project) missing.push("so_project");
    if (missing.length > 0) {
      const msg = `Vul eerst de verkooporder instellingen in (${missing.join(", ")}).`;
      await logFailure(msg);
      return json({ error: msg, missing }, 400);
    }

    // 2. Fetch material lines
    const { data: material, error: matErr } = await supabase
      .from("case_material_lines")
      .select("id, article_number, description, total_quantity")
      .eq("case_id", case_id);
    if (matErr) throw matErr;

    // 2a. Block: positive total without article_number
    const orphan = (material ?? []).filter((m: any) => {
      const n = Number(m.total_quantity);
      return Number.isFinite(n) && n > 0 && (!m.article_number || String(m.article_number).trim() === "");
    });
    if (orphan.length > 0) {
      const msg = `Export geblokkeerd: ${orphan.length} materiaalregel(s) met hoeveelheid > 0 zonder artikelnummer.`;
      await logFailure(msg);
      return json({
        error: msg,
        orphan_count: orphan.length,
        orphan_lines: orphan.map((o: any) => ({
          id: o.id,
          description: o.description,
          total_quantity: o.total_quantity,
        })),
      }, 400);
    }

    // 2b. Block: invalid numeric values
    const invalid = (material ?? []).filter((m: any) => {
      if (m.total_quantity == null) return false;
      const n = Number(m.total_quantity);
      return !Number.isFinite(n);
    });
    if (invalid.length > 0) {
      const msg = `Export geblokkeerd: ${invalid.length} materiaalregel(s) met ongeldige hoeveelheid.`;
      await logFailure(msg);
      return json({ error: msg, invalid_count: invalid.length }, 400);
    }

    // 3. Aggregate per article_number (only total_quantity > 0)
    const agg = new Map<string, number>();
    for (const m of material ?? []) {
      const n = Number(m.total_quantity);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (!m.article_number) continue;
      agg.set(m.article_number, (agg.get(m.article_number) ?? 0) + n);
    }

    if (agg.size === 0) {
      const msg = "Geen exporteerbare regels: er zijn geen materiaalregels met totaal > 0.";
      await logFailure(msg);
      return json({ error: msg }, 400);
    }

    // 4. Replace verkooporder_lines
    const { error: delErr } = await supabase
      .from("verkooporder_lines")
      .delete()
      .eq("case_id", case_id);
    if (delErr) throw delErr;

    const insertRows = [...agg.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([article, qty]) => ({
        case_id,
        sol_articlenumber: article,
        sol_quantity: qty,
        so_number: caseRow.so_number,
        so_customernumber: caseRow.so_customernumber,
        so_project: caseRow.so_project,
      }));

    const { error: insErr } = await supabase
      .from("verkooporder_lines")
      .insert(insertRows);
    if (insErr) throw insErr;

    // 5. Build CSV
    const headers = [
      "sol_articlenumber",
      "sol_quantity",
      "so_number",
      "so_customernumber",
      "so_project",
    ];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv =
      headers.join(",") +
      "\n" +
      insertRows.map((r: any) => headers.map((h) => escape(r[h])).join(",")).join("\n") +
      "\n";

    // 6. Log success
    await supabase.from("export_logs").insert({
      case_id,
      export_type: "verkooporder_csv",
      file_name: intendedFileName,
      row_count: insertRows.length,
      status: "success",
      exported_by: "system",
    });

    // 7. Update case: clear stale, mark exported, set rebuild timestamp
    const now = new Date().toISOString();
    await supabase
      .from("cases")
      .update({
        status: "geexporteerd",
        last_exported_at: now,
        last_verkooporder_rebuild_at: now,
        export_stale: false,
      })
      .eq("id", case_id);

    return json({
      csv,
      file_name: intendedFileName,
      row_count: insertRows.length,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "Onbekende fout bij export.";
    console.error(e);
    await logFailure(msg);
    return json({ error: msg }, 500);
  }
});
