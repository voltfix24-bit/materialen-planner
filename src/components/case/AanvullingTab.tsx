import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function AanvullingTab({
  caseId,
  caseRow,
}: {
  caseId: string;
  caseRow: any;
}) {
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["aanvulling", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_order_lines")
        .select("*")
        .eq("case_id", caseId)
        .order("article_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: unmatched = [] } = useQuery({
    queryKey: ["aanvulling-unmatched", caseId],
    queryFn: async () => {
      // Material lines with total > 0 but no active Liander match
      const [{ data: material }, { data: liander }] = await Promise.all([
        supabase
          .from("case_material_lines")
          .select("article_number, description, unit, total_quantity")
          .eq("case_id", caseId)
          .gt("total_quantity", 0),
        supabase
          .from("liander_assortment_items")
          .select("article_number")
          .eq("active", true),
      ]);
      const set = new Set(
        (liander ?? []).map((l: any) => l.article_number).filter(Boolean),
      );
      return (material ?? []).filter(
        (m: any) => m.article_number && !set.has(m.article_number),
      );
    },
  });

  const rebuild = useMutation({
    mutationFn: async () => {
      const { data: material, error: mErr } = await supabase
        .from("case_material_lines")
        .select("article_number, description, unit, total_quantity")
        .eq("case_id", caseId)
        .gt("total_quantity", 0);
      if (mErr) throw mErr;
      const { data: liander, error: lErr } = await supabase
        .from("liander_assortment_items")
        .select("id, article_number")
        .eq("active", true);
      if (lErr) throw lErr;
      const lianderMap = new Map(
        (liander ?? []).map((l: any) => [l.article_number, l.id]),
      );
      // Aggregate per article_number for matched only
      const agg = new Map<
        string,
        { description: string | null; unit: string | null; qty: number }
      >();
      for (const m of material ?? []) {
        if (!m.article_number || !lianderMap.has(m.article_number)) continue;
        const cur = agg.get(m.article_number);
        const qty = (cur?.qty ?? 0) + (Number(m.total_quantity) || 0);
        agg.set(m.article_number, {
          description: m.description ?? cur?.description ?? null,
          unit: m.unit ?? cur?.unit ?? null,
          qty,
        });
      }
      await supabase.from("case_order_lines").delete().eq("case_id", caseId);
      const insert = [...agg.entries()].map(([article, v]) => ({
        case_id: caseId,
        article_number: article,
        description: v.description,
        unit: v.unit,
        customer_quantity: v.qty,
        matched_liander_assortment_item_id: lianderMap.get(article) ?? null,
        match_status: "matched",
      }));
      if (insert.length > 0) {
        const { error } = await supabase.from("case_order_lines").insert(insert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aanvulling", caseId] });
      qc.invalidateQueries({ queryKey: ["aanvulling-unmatched", caseId] });
      toast.success("Aanvulling opnieuw opgebouwd");
    },
  });

  const updateRow = useMutation({
    mutationFn: async (patch: any) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("case_order_lines")
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aanvulling", caseId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("case_order_lines")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aanvulling", caseId] }),
  });

  const totalQty = useMemo(
    () =>
      rows.reduce((s: number, r: any) => s + (Number(r.customer_quantity) || 0), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Bestelvoorbereiding richting Liander. Alleen artikelen die voorkomen in
          de actieve Liander Assortimentslijst worden hier opgenomen.
        </p>
        <Button variant="outline" onClick={() => rebuild.mutate()}>
          <RefreshCw className="h-4 w-4" /> Aanvulling opnieuw opbouwen
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>
            {rows.length} aanvullingsregels · Totaal hoeveelheid:{" "}
            <span className="font-medium tabular-nums">{totalQty}</span>
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
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
                    className="bg-emerald-100 text-emerald-700"
                  >
                    Ja
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

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            Niet gevonden in actieve Liander Assortimentslijst
          </span>
          <span className="text-xs text-amber-700">
            ({unmatched.length} artikel{unmatched.length === 1 ? "" : "en"})
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Artikelnr</th>
              <th className="px-4 py-2">Omschrijving</th>
              <th className="px-4 py-2 text-right">Hoeveelheid</th>
              <th className="px-4 py-2">Eenheid</th>
              <th className="px-4 py-2">Reden</th>
            </tr>
          </thead>
          <tbody>
            {unmatched.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-xs text-slate-400"
                >
                  Geen ongematchte artikelen.
                </td>
              </tr>
            )}
            {unmatched.map((m: any) => (
              <tr key={m.article_number} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{m.article_number}</td>
                <td className="px-4 py-2">{m.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {Number(m.total_quantity)}
                </td>
                <td className="px-4 py-2 text-slate-500">{m.unit}</td>
                <td className="px-4 py-2 text-amber-700">
                  Niet gevonden in actieve Liander Assortimentslijst
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
