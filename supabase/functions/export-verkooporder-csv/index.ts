// Edge function: export verkooporder as CSV with auto-rebuild
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { case_id } = await req.json();
    if (!case_id || typeof case_id !== "string") {
      return new Response(JSON.stringify({ error: "case_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Validate case
    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("id, case_number, so_number, so_customernumber, so_project")
      .eq("id", case_id)
      .single();
    if (caseErr) throw caseErr;

    const missing: string[] = [];
    if (!caseRow.so_number) missing.push("so_number");
    if (!caseRow.so_customernumber) missing.push("so_customernumber");
    if (!caseRow.so_project) missing.push("so_project");
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({
          error:
            "Vul eerst de verkooporder instellingen in voordat je exporteert.",
          missing,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Rebuild verkooporder_lines from current case_material_lines
    const { data: material, error: matErr } = await supabase
      .from("case_material_lines")
      .select("article_number, total_quantity")
      .eq("case_id", case_id);
    if (matErr) throw matErr;

    const agg = new Map<string, number>();
    for (const m of material ?? []) {
      const n = Number(m.total_quantity) || 0;
      if (!m.article_number || n <= 0) continue;
      agg.set(m.article_number, (agg.get(m.article_number) ?? 0) + n);
    }

    // 3+4. Replace verkooporder_lines
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

    if (insertRows.length > 0) {
      const { error: insErr } = await supabase
        .from("verkooporder_lines")
        .insert(insertRows);
      if (insErr) throw insErr;
    }

    if (insertRows.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "Geen exporteerbare regels: er zijn geen materiaalregels met totaal > 0.",
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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
      insertRows.map((r: any) => headers.map((h) => escape(r[h])).join(",")).join(
        "\n",
      ) +
      "\n";

    const fileName = `Case ${caseRow.case_number ?? case_id}.csv`;

    // 6. Log export
    await supabase.from("export_logs").insert({
      case_id,
      export_type: "verkooporder_csv",
      file_name: fileName,
      row_count: insertRows.length,
      status: "success",
    });

    // 7. Update case status + clear stale + last_exported_at
    await supabase
      .from("cases")
      .update({
        status: "geexporteerd",
        last_exported_at: new Date().toISOString(),
        export_stale: false,
      })
      .eq("id", case_id);

    return new Response(
      JSON.stringify({
        csv,
        file_name: fileName,
        row_count: insertRows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
