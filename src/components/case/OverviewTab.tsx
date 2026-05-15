import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function OverviewTab({ caseRow }: { caseRow: any }) {
  const { data: counts } = useQuery({
    queryKey: ["case-counts", caseRow.id],
    queryFn: async () => {
      const [{ count: lines }, { count: vol }, { count: aanv }] = await Promise.all([
        supabase
          .from("case_material_lines")
          .select("*", { count: "exact", head: true })
          .eq("case_id", caseRow.id),
        supabase
          .from("verkooporder_lines")
          .select("*", { count: "exact", head: true })
          .eq("case_id", caseRow.id),
        supabase
          .from("case_order_lines")
          .select("*", { count: "exact", head: true })
          .eq("case_id", caseRow.id),
      ]);
      return { lines: lines ?? 0, vol: vol ?? 0, aanv: aanv ?? 0 };
    },
  });

  const fields: Array<[string, string | null]> = [
    ["Casenummer", caseRow.case_number],
    ["Projectnummer", caseRow.project_number],
    ["Omschrijving", caseRow.description],
    ["Datum", caseRow.case_date],
    ["Versie / template", caseRow.template_version],
    ["ASP / SAP-code", caseRow.asp_sap_code],
    ["Afleveradres", caseRow.delivery_address],
    ["Contactpersoon", caseRow.contact_person],
    ["SO-klantnummer", caseRow.so_customernumber],
    ["SO-project", caseRow.so_project],
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="col-span-2 p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Projectgegevens</h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {fields.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-medium">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        {caseRow.internal_note && (
          <div className="mt-6">
            <div className="text-xs text-slate-500">Opmerking intern</div>
            <div className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">
              {caseRow.internal_note}
            </div>
          </div>
        )}
      </Card>
      <Card className="space-y-4 p-6">
        <h3 className="text-sm font-semibold text-slate-700">Tellingen</h3>
        <Stat label="Materiaalregels" value={counts?.lines ?? "…"} />
        <Stat label="Aanvulling-regels" value={counts?.aanv ?? "…"} />
        <Stat label="Verkooporder-regels" value={counts?.vol ?? "…"} />
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between border-b pb-3 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}
