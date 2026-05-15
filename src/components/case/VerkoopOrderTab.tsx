import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle } from "lucide-react";
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

  const { data: material = [] } = useQuery({
    queryKey: ["material-count", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_material_lines")
        .select("article_number, total_quantity")
        .eq("case_id", caseId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sourceCount = useMemo(
    () =>
      material.filter((m: any) => Number(m.total_quantity) > 0 && m.article_number)
        .length,
    [material],
  );

  const orphanCount = useMemo(
    () =>
      material.filter(
        (m: any) =>
          Number(m.total_quantity) > 0 &&
          (!m.article_number || String(m.article_number).trim() === ""),
      ).length,
    [material],
  );

  const rebuild = useMutation({
    mutationFn: async () => {
      const agg = new Map<string, number>();
      for (const m of material) {
        const n = Number(m.total_quantity) || 0;
        if (!m.article_number || n <= 0) continue;
        agg.set(m.article_number, (agg.get(m.article_number) ?? 0) + n);
      }
      await supabase.from("verkooporder_lines").delete().eq("case_id", caseId);
      const insert = [...agg.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([article, qty]) => ({
          case_id: caseId,
          sol_articlenumber: article,
          sol_quantity: qty,
          so_number: caseRow.so_number ?? "",
          so_customernumber: caseRow.so_customernumber ?? "",
          so_project: caseRow.so_project ?? "",
        }));
      if (insert.length > 0) {
        const { error } = await supabase.from("verkooporder_lines").insert(insert);
        if (error) throw error;
      }
      await supabase
        .from("cases")
        .update({ last_verkooporder_rebuild_at: new Date().toISOString() })
        .eq("id", caseId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verkooporder", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      toast.success("Verkooporder preview opnieuw opgebouwd");
    },
  });

  const total = rows.reduce(
    (s: number, r: any) => s + (Number(r.sol_quantity) || 0),
    0,
  );

  const settingsMissing =
    !caseRow.so_number || !caseRow.so_customernumber || !caseRow.so_project;

  const stale = caseRow.export_stale === true;

  const fmt = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString("nl-NL") : "—";

  return (
    <div className="space-y-4">
      {settingsMissing && (
        <Card className="flex items-start gap-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <strong>Verkooporder instellingen ontbreken.</strong> Vul so_number,
            so_customernumber en so_project in op het tabblad Overzicht voordat
            je exporteert.
          </div>
        </Card>
      )}
      {stale && (
        <Card className="flex items-start gap-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            Materiaal of instellingen zijn gewijzigd na de laatste export —
            Verkooporder is verouderd. Bij een nieuwe CSV-export wordt
            automatisch opnieuw opgebouwd.
          </div>
        </Card>
      )}
      {orphanCount > 0 && (
        <Card className="flex items-start gap-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <strong>{orphanCount}</strong> materiaalregel(s) met hoeveelheid &gt; 0
            zonder artikelnummer. CSV-export wordt geblokkeerd tot dit is
            opgelost.
          </div>
        </Card>
      )}

      <Card className="grid grid-cols-3 gap-4 p-4 text-sm md:grid-cols-6">
        <Stat label="Bronregels (materiaal > 0)" value={sourceCount} />
        <Stat label="Verkooporderregels" value={rows.length} />
        <Stat label="Totaal aantal" value={total} />
        <Stat label="Zonder artikelnr." value={orphanCount} />
        <Stat label="Laatste rebuild" value={fmt(caseRow.last_verkooporder_rebuild_at)} />
        <Stat
          label="Laatste export"
          value={fmt(caseRow.last_exported_at)}
        />
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Preview van de Verkooporder. De CSV-export rebuild altijd zelf — deze
          knop is voor controle.
        </p>
        <Button variant="outline" onClick={() => rebuild.mutate()}>
          <RefreshCw className="h-4 w-4" /> Preview opnieuw opbouwen
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
                  Geen verkooporderregels — wordt automatisch opgebouwd bij
                  CSV-export.
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">
                  {r.sol_articlenumber}
                </td>
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

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// Badge import kept for potential future use
export { Badge };
