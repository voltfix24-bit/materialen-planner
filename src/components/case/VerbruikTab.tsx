import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export function VerbruikTab({ caseId, caseRow }: { caseId: string; caseRow: any }) {
  const { data: lines = [] } = useQuery({
    queryKey: ["verbruik", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_material_lines")
        .select(
          "id, article_number, description, total_quantity, used_quantity, unit, charge_or_haspel_number, category_code, note",
        )
        .eq("case_id", caseId)
        .order("category_code")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const visible = lines.filter(
    (l: any) =>
      Number(l.total_quantity) > 0 || Number(l.used_quantity) > 0 || l.charge_or_haspel_number,
  );

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">Artikelnr</th>
            <th className="px-4 py-2">Omschrijving</th>
            <th className="px-4 py-2 text-right">Hoeveelheid</th>
            <th className="px-4 py-2">Eenheid</th>
            <th className="px-4 py-2">Charge/haspel</th>
            <th className="px-4 py-2">Categorie</th>
            <th className="px-4 py-2">Case</th>
            <th className="px-4 py-2">Project</th>
            <th className="px-4 py-2">Opmerking</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                Geen verbruikregels — vul aantallen in op de Materiaalstaat.
              </td>
            </tr>
          )}
          {visible.map((l: any) => (
            <tr key={l.id} className="border-t">
              <td className="px-4 py-2 font-mono text-xs">{l.article_number}</td>
              <td className="px-4 py-2">{l.description}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {Number(l.total_quantity)}
              </td>
              <td className="px-4 py-2 text-slate-500">{l.unit}</td>
              <td className="px-4 py-2 font-mono text-xs">
                {l.charge_or_haspel_number || "—"}
              </td>
              <td className="px-4 py-2">{l.category_code}</td>
              <td className="px-4 py-2">{caseRow.case_number}</td>
              <td className="px-4 py-2">{caseRow.project_number}</td>
              <td className="px-4 py-2 text-slate-500">{l.note || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
