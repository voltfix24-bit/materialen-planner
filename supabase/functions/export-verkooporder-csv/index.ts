// Edge function: export verkooporder as CSV
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("case_number")
      .eq("id", case_id)
      .single();
    if (caseErr) throw caseErr;

    const { data: rows, error: rowsErr } = await supabase
      .from("verkooporder_lines")
      .select("sol_articlenumber, sol_quantity, so_number, so_customernumber, so_project")
      .eq("case_id", case_id)
      .gt("sol_quantity", 0)
      .order("sol_articlenumber");
    if (rowsErr) throw rowsErr;

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
      (rows ?? [])
        .map((r: any) => headers.map((h) => escape(r[h])).join(","))
        .join("\n") +
      "\n";

    const fileName = `Case ${caseRow.case_number ?? case_id}.csv`;

    await supabase.from("export_logs").insert({
      case_id,
      export_type: "verkooporder_csv",
      file_name: fileName,
      row_count: rows?.length ?? 0,
      status: "success",
    });

    await supabase.from("cases").update({ status: "geexporteerd" }).eq("id", case_id);

    return new Response(JSON.stringify({ csv, file_name: fileName, row_count: rows?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
