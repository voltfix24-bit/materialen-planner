import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function AanvullingTab({ caseId, caseRow }: { caseId: string; caseRow: any }) {
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["aanvulling", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_order_lines")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rebuild = useMutation({
    mutationFn: async () => {
      // Placeholder: build aanvulling from material lines that match Liander assortment
      const { data: material } = await supabase
        .from("case_material_lines")
        .select("article_number, description, unit, total_quantity")
        .eq("case_id", caseId)
        .gt("total_quantity", 0);
      const { data: liander } = await supabase
        .from("liander_assortment_items")
        .select("id, article_number")
        .eq("active", true);
      const lianderMap = new Map(
        (liander ?? []).map((l: any) => [l.article_number, l.id]),
      );
      await supabase.from("case_order_lines").delete().eq("case_id", caseId);
      const insert = (material ?? []).map((m: any) => ({
        case_id: caseId,
        article_number: m.article_number,
        description: m.description,
        unit: m.unit,
        customer_quantity: Number(m.total_quantity) || 0,
        matched_liander_assortment_item_id: lianderMap.get(m.article_number) ?? null,
        match_status: lianderMap.has(m.article_number) ? "match" : "no_match",
      }));
      if (insert.length > 0) {
        const { error } = await supabase.from("case_order_lines").insert(insert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aanvulling", caseId] });
      toast.success("Aanvulling opnieuw opgebouwd");
    },
  });

  const updateRow = useMutation({
    mutationFn: async (patch: any) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("case_order_lines").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aanvulling", caseId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("case_order_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aanvulling", caseId] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Bestelvoorbereiding op basis van de Liander Assortimentslijst. Klant
          Hoeveelheid is per case.
        </p>
        <Button variant="outline" onClick={() => rebuild.mutate()}>
          <RefreshCw className="h-4 w-4" /> Aanvulling opnieuw opbouwen
        </Button>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Artikelnr</th>
              <th className="px-4 py-2">Omschrijving</th>
              <th className="px-4 py-2">Eenheid</th>
              <th className="px-4 py-2 w-32 text-right">Klant Hoeveelheid</th>
              <th className="px-4 py-2">Match Liander</th>
              <th className="px-4 py-2">Case</th>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Opmerking</th>
              <th className="px-4 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  Geen aanvullingsregels — klik op "Opnieuw opbouwen".
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{r.article_number}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2 text-slate-500">{r.unit}</td>
                <td className="px-4 py-2">
                  <QtyCell
                    value={r.customer_quantity}
                    onChange={(v) =>
                      updateRow.mutate({ id: r.id, customer_quantity: v })
                    }
                  />
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant="secondary"
                    className={
                      r.match_status === "match"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600"
                    }
                  >
                    {r.match_status === "match" ? "Ja" : "Nee"}
                  </Badge>
                </td>
                <td className="px-4 py-2">{caseRow.case_number}</td>
                <td className="px-4 py-2">{caseRow.project_number}</td>
                <td className="px-4 py-2">
                  <Input
                    defaultValue={r.note ?? ""}
                    className="h-8"
                    onBlur={(e) =>
                      e.target.value !== (r.note ?? "") &&
                      updateRow.mutate({ id: r.id, note: e.target.value })
                    }
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove.mutate(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function QtyCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [v, setV] = useState(String(value ?? 0));
  return (
    <Input
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (!Number.isNaN(n) && n !== Number(value)) onChange(n);
      }}
      className="h-8 text-right tabular-nums"
    />
  );
}
