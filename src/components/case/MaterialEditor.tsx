import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, Copy, Plus, Search, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Line = {
  id: string;
  case_id: string;
  article_id: string | null;
  article_number: string | null;
  description: string | null;
  sort_order: number;
  quantity: number;
  unit: string | null;
  used_quantity: number;
  return_quantity: number;
  total_quantity: number;
  note: string | null;
  category_id: string | null;
  category_code: string | null;
  charge_or_haspel_number: string | null;
  is_manual: boolean;
  is_auto_generated: boolean;
};

export function MaterialEditor({ caseId }: { caseId: string }) {
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lines = [] } = useQuery<Line[]>({
    queryKey: ["material-lines", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_material_lines")
        .select("*")
        .eq("case_id", caseId)
        .order("category_id", { nullsFirst: true })
        .order("sort_order");
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const updateLine = useMutation({
    mutationFn: async (patch: Partial<Line> & { id: string }) => {
      const { id, ...rest } = patch;
      const next: any = { ...rest };
      if ("quantity" in rest || "return_quantity" in rest) {
        const cur = lines.find((l) => l.id === id)!;
        const q = "quantity" in rest ? Number(rest.quantity) : Number(cur.quantity);
        const r =
          "return_quantity" in rest
            ? Number(rest.return_quantity)
            : Number(cur.return_quantity);
        next.total_quantity = (q || 0) - (r || 0);
      }
      const { error } = await supabase
        .from("case_material_lines")
        .update(next)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-lines", caseId] }),
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("case_material_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-lines", caseId] });
      toast.success("Regel verwijderd");
    },
  });

  const duplicateLine = useMutation({
    mutationFn: async (id: string) => {
      const src = lines.find((l) => l.id === id);
      if (!src) return;
      const { id: _omit, ...rest } = src as any;
      const { error } = await supabase.from("case_material_lines").insert({
        ...rest,
        is_manual: true,
        is_auto_generated: false,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-lines", caseId] }),
  });

  const addArticle = useMutation({
    mutationFn: async (article: any) => {
      const { error } = await supabase.from("case_material_lines").insert({
        case_id: caseId,
        article_id: article.id,
        article_number: article.article_number,
        description: article.description,
        unit: article.unit,
        category_id: article.category_id,
        category_code: article.category_code,
        sort_order: article.sort_order ?? 0,
        quantity: 0,
        used_quantity: 0,
        return_quantity: 0,
        total_quantity: 0,
        is_manual: true,
        is_auto_generated: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-lines", caseId] });
      toast.success("Regel toegevoegd");
    },
  });

  const stats = useMemo(() => {
    const missing = (l: Line) => !l.article_number || !l.description;
    return {
      total: lines.length,
      withTotal: lines.filter((l) => Number(l.total_quantity) > 0).length,
      missing: lines.filter(missing).length,
      withReturn: lines.filter((l) => Number(l.return_quantity) > 0).length,
      withCharge: lines.filter((l) => l.charge_or_haspel_number).length,
    };
  }, [lines]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; sort: number; lines: Line[] }>();
    for (const cat of categories ?? []) {
      map.set(cat.id, { name: cat.name, sort: cat.sort_order, lines: [] });
    }
    map.set("__none", { name: "Zonder categorie", sort: 9999, lines: [] });
    for (const l of lines) {
      const k = l.category_id ?? "__none";
      if (!map.has(k)) map.set(k, { name: "Onbekend", sort: 9998, lines: [] });
      map.get(k)!.lines.push(l);
    }
    return [...map.entries()]
      .filter(([, v]) => v.lines.length > 0)
      .sort((a, b) => a[1].sort - b[1].sort);
  }, [lines, categories]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-5 gap-4">
          <Stat label="Totaal regels" value={stats.total} />
          <Stat label="Met totaal > 0" value={stats.withTotal} />
          <Stat label="Ontbrekende data" value={stats.missing} warn={stats.missing > 0} />
          <Stat label="Met retour" value={stats.withReturn} />
          <Stat label="Met charge/haspel" value={stats.withCharge} />
        </div>
      </Card>

      <Card className="flex items-center gap-3 p-4">
        <ArticlePicker onPick={(a) => addArticle.mutate(a)} />
        <span className="text-xs text-slate-500">
          Zoek artikelnummer of omschrijving en voeg toe aan de materiaalstaat.
        </span>
      </Card>

      {grouped.length === 0 && (
        <Card className="p-10 text-center text-sm text-slate-500">
          Nog geen materiaalregels. Voeg een artikel toe om te beginnen.
        </Card>
      )}

      {grouped.map(([catId, group]) => (
        <CategoryBlock
          key={catId}
          name={group.name}
          lines={group.lines}
          onUpdate={(patch) => updateLine.mutate(patch)}
          onDelete={(id) => deleteLine.mutate(id)}
          onDuplicate={(id) => duplicateLine.mutate(id)}
        />
      ))}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          warn && "text-amber-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CategoryBlock({
  name,
  lines,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  name: string;
  lines: Line[];
  onUpdate: (p: Partial<Line> & { id: string }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="overflow-hidden p-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left">
          <div className="flex items-center gap-3">
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")}
            />
            <span className="font-semibold">{name}</span>
            <Badge variant="secondary">{lines.length}</Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr className="border-t">
                <th className="px-3 py-2">Artikelnr</th>
                <th className="px-3 py-2">Omschrijving</th>
                <th className="px-3 py-2 w-20">Eenheid</th>
                <th className="px-3 py-2 w-24 text-right">Aantal</th>
                <th className="px-3 py-2 w-24 text-right">Verbruikt</th>
                <th className="px-3 py-2 w-24 text-right">Retour</th>
                <th className="px-3 py-2 w-24 text-right">Totaal</th>
                <th className="px-3 py-2 w-32">Charge/haspel</th>
                <th className="px-3 py-2">Opmerking</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const missing = !l.article_number || !l.description;
                const negative = Number(l.total_quantity) < 0;
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      "border-t",
                      missing && "bg-amber-50/40",
                      negative && "bg-red-50/40",
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        {l.article_number || (
                          <span className="text-amber-600">
                            <AlertTriangle className="inline h-3 w-3" /> ontbreekt
                          </span>
                        )}
                        {l.is_auto_generated && (
                          <Badge variant="outline" className="text-[10px]">
                            auto
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{l.description || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{l.unit || ""}</td>
                    <td className="px-3 py-2">
                      <NumberCell
                        value={l.quantity}
                        onChange={(v) => onUpdate({ id: l.id, quantity: v })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberCell
                        value={l.used_quantity}
                        onChange={(v) => onUpdate({ id: l.id, used_quantity: v })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberCell
                        value={l.return_quantity}
                        onChange={(v) => onUpdate({ id: l.id, return_quantity: v })}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-medium tabular-nums",
                        negative && "text-red-600",
                      )}
                    >
                      {Number(l.total_quantity)}
                    </td>
                    <td className="px-3 py-2">
                      <TextCell
                        value={l.charge_or_haspel_number ?? ""}
                        placeholder="—"
                        onChange={(v) =>
                          onUpdate({ id: l.id, charge_or_haspel_number: v || (null as any) })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextCell
                        value={l.note ?? ""}
                        placeholder="—"
                        onChange={(v) => onUpdate({ id: l.id, note: v || (null as any) })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDuplicate(l.id)}
                        title="Dupliceren"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(l.id)}
                        title="Verwijderen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function NumberCell({
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

function TextCell({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [v, setV] = useState(value ?? "");
  return (
    <Input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onChange(v)}
      className="h-8"
    />
  );
}

function ArticlePicker({ onPick }: { onPick: (a: any) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["articles-search", q],
    enabled: open && q.length >= 1,
    queryFn: async () => {
      const term = `%${q}%`;
      const { data, error } = await supabase
        .from("articles")
        .select("id, article_number, description, unit, category_id, category_code, sort_order")
        .eq("active", true)
        .or(`article_number.ilike.${term},description.ilike.${term}`)
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Artikel toevoegen
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek artikelnummer of omschrijving"
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {q.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500">
              Begin met typen om te zoeken.
            </div>
          )}
          {q.length > 0 && isLoading && (
            <div className="p-4 text-center text-xs text-slate-500">Laden…</div>
          )}
          {q.length > 0 && !isLoading && (data ?? []).length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500">
              Geen artikelen gevonden.
            </div>
          )}
          {(data ?? []).map((a: any) => (
            <button
              key={a.id}
              onClick={() => {
                onPick(a);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
            >
              <div>
                <div className="font-mono text-xs text-slate-500">
                  {a.article_number}
                </div>
                <div>{a.description || "—"}</div>
              </div>
              <div className="text-xs text-slate-400">{a.unit}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
