import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function VerkoopOrderTab({
  caseId,
  caseRow,
}: {
  caseId: string;
  caseRow: any;
}) {
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["verkooporder", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verkooporder_lines")
        .select("*")
        .eq("case_id", caseId)
        .order("sol_articlenumber");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rebuild = useMutation({
    mutationFn: async () => {
      const { data: material } = await supabase
        .from("case_material_lines")
        .select("article_number, total_quantity")
        .eq("case_id", caseId);
      // aggregate by article_number, sum totals > 0
      const agg = new Map<string, number>();
      for (const m of material ?? []) {
        const n = Number(m.total_quantity) || 0;
        if (!m.article_number || n <= 0) continue;
        agg.set(m.article_number, (agg.get(m.article_number) ?? 0) + n);
      }
      await supabase.from("verkooporder_lines").delete().eq("case_id", caseId);
      const insert = [...agg.entries()].map(([article, qty]) => ({
        case_id: caseId,
        sol_articlenumber: article,
        sol_quantity: qty,
        so_number: caseRow.case_number ?? "",
        so_customernumber: caseRow.so_customernumber ?? "",
        so_project: caseRow.so_project ?? "",
      }));
      if (insert.length > 0) {
        const { error } = await supabase.from("verkooporder_lines").insert(insert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verkooporder", caseId] });
      toast.success("Verkooporder opnieuw opgebouwd");
    },
  });

  const total = rows.reduce((s: number, r: any) => s + (Number(r.sol_quantity) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Exact dezelfde structuur als het Excel-tabblad “Verkooporder”. Alleen
          regels met quantity {">"} 0 worden meegenomen.
        </p>
        <Button variant="outline" onClick={() => rebuild.mutate()}>
          <RefreshCw className="h-4 w-4" /> Verkooporder opnieuw opbouwen
        </Button>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">sol_articlenumber</th>
              <th className="px-4 py-2 text-right">sol_quantity</th>
              <th className="px-4 py-2">so_number</th>
              <th className="px-4 py-2">so_customernumber</th>
              <th className="px-4 py-2">so_project</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Geen verkooporderregels — klik op "Opnieuw opbouwen".
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{r.sol_articlenumber}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {Number(r.sol_quantity)}
                </td>
                <td className="px-4 py-2">{r.so_number}</td>
                <td className="px-4 py-2">{r.so_customernumber}</td>
                <td className="px-4 py-2">{r.so_project}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t bg-slate-50 font-medium">
                <td className="px-4 py-2 text-right">Totaal</td>
                <td className="px-4 py-2 text-right tabular-nums">{total}</td>
                <td colSpan={3}></td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
