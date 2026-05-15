import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  Copy,
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
  Pencil,
  ListPlus,
  Wand2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const CATEGORY_ORDER = [
  "Kabels",
  "MS Installatie",
  "MS patronen",
  "Aarding",
  "Eindsluitingen MS",
  "Moffen MS",
  "Magnefix",
  "LS-rek",
  "Stationsinrichting",
  "I-Netten",
  "Trafo",
  "Overige",
  "Asbest",
  "Moffen LS",
  "Standaard voorraad",
  "Extra voorraad",
  "Compact station",
  "Mantelbuis",
  "Algemeen",
];

type LianderStatus = "active" | "inactive" | "not_found" | "unknown";

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
  source_rule: string | null;
  liander_status: LianderStatus;
  liander_description: string | null;
  liander_unit: string | null;
};

type Category = {
  id: string;
  name: string;
  category_code: string | null;
  sort_order: number;
};

type SourceFilter =
  | "all"
  | "articles"
  | "liander_active"
  | "liander_inactive";

export function MaterialEditor({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState<{ categoryId: string | null } | null>(null);
  const [pickerForCategory, setPickerForCategory] = useState<string | null>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,category_code,sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  // Single RPC: case lines + Liander match status (server-side join)
  const { data: lines = [], isLoading } = useQuery<Line[]>({
    queryKey: ["material-lines", caseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_case_material_lines_with_status",
        { p_case_id: caseId },
      );
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["material-lines", caseId] });

  // ---------- Mutations ----------
  const updateLine = useMutation({
    mutationFn: async (patch: Partial<Line> & { id: string }) => {
      const { id, liander_status, liander_description, liander_unit, ...rest } =
        patch as any;
      const next: any = { ...rest };
      if ("quantity" in rest || "return_quantity" in rest) {
        const cur = lines.find((l) => l.id === id)!;
        const q =
          "quantity" in rest ? Number(rest.quantity) : Number(cur.quantity);
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
    onSuccess: invalidate,
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("case_material_lines")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Regel verwijderd");
    },
  });

  const duplicateLine = useMutation({
    mutationFn: async (id: string) => {
      const src = lines.find((l) => l.id === id);
      if (!src) return;
      const {
        id: _omit,
        liander_status: _ls,
        liander_description: _ld,
        liander_unit: _lu,
        created_at,
        updated_at,
        ...rest
      } = src as any;
      const { error } = await supabase.from("case_material_lines").insert({
        ...rest,
        is_manual: true,
        is_auto_generated: false,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: "up" | "down" }) => {
      const { data, error } = await (supabase as any).rpc(
        "reorder_case_material_line",
        { p_case_id: caseId, p_line_id: id, p_direction: dir },
      );
      if (error) throw error;
      if (data && data.success === false && data.error !== "no_neighbor") {
        throw new Error(data.error);
      }
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Verplaatsen mislukt"),
  });

  const moveCategory = useMutation({
    mutationFn: async ({ id, categoryId }: { id: string; categoryId: string }) => {
      const { error } = await (supabase as any).rpc(
        "move_case_material_line_to_category",
        {
          p_case_id: caseId,
          p_line_id: id,
          p_category_id: categoryId,
        },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const normalize = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "normalize_case_material_sort_order",
        { p_case_id: caseId },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      invalidate();
      toast.success(`Volgorde hersteld (${d?.updated ?? 0} regels)`);
    },
  });

  const bulkInsert = useMutation({
    mutationFn: async (rows: any[]) => {
      const { data, error } = await (supabase as any).rpc(
        "bulk_add_case_material_lines",
        { p_case_id: caseId, p_lines: rows },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const withQty = lines.filter((l) => Number(l.total_quantity) > 0);
    return {
      total: lines.length,
      withTotal: withQty.length,
      missingArt: withQty.filter((l) => !l.article_number).length,
      negative: lines.filter((l) => Number(l.total_quantity) < 0).length,
      withReturn: lines.filter((l) => Number(l.return_quantity) > 0).length,
      withCharge: lines.filter((l) => l.charge_or_haspel_number).length,
      noLianderMatch: withQty.filter(
        (l) => l.article_number && l.liander_status !== "active",
      ).length,
    };
  }, [lines]);

  const grouped = useMemo(() => {
    const byName = new Map<string, Category>();
    for (const c of categories) byName.set(c.name, c);

    const blocks = CATEGORY_ORDER.map((name) => ({
      name,
      category: byName.get(name) ?? null,
      lines: [] as Line[],
    }));

    const orphans: Line[] = [];
    const blockByCatId = new Map<string, (typeof blocks)[number]>();
    for (const b of blocks) if (b.category) blockByCatId.set(b.category.id, b);

    for (const l of lines) {
      const b = l.category_id ? blockByCatId.get(l.category_id) : null;
      if (b) b.lines.push(l);
      else orphans.push(l);
    }

    for (const b of blocks) {
      b.lines.sort(
        (a, b2) =>
          a.sort_order - b2.sort_order ||
          (a.article_number ?? "").localeCompare(b2.article_number ?? ""),
      );
    }
    return { blocks, orphans };
  }, [lines, categories]);

  const insertSinglePick = (a: any, source: "articles" | "liander", catId: string | null) => {
    bulkInsert.mutate([
      {
        article_id: source === "articles" ? a.id : null,
        article_number: a.article_number,
        description: a.description ?? null,
        unit: a.unit ?? null,
        category_id: catId ?? a.category_id ?? null,
        category_code: a.category_code ?? null,
        quantity: 0,
        used_quantity: 0,
        return_quantity: 0,
        total_quantity: 0,
        is_manual: false,
        is_auto_generated: false,
        source_rule: source,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Stat label="Totaal regels" value={stats.total} />
          <Stat label="Totaal > 0" value={stats.withTotal} />
          <Stat label="Geen artikelnr" value={stats.missingArt} warn={stats.missingArt > 0} />
          <Stat label="Negatief totaal" value={stats.negative} warn={stats.negative > 0} />
          <Stat label="Met retour" value={stats.withReturn} />
          <Stat label="Met charge/haspel" value={stats.withCharge} />
          <Stat label="Niet in Liander" value={stats.noLianderMatch} warn={stats.noLianderMatch > 0} />
        </div>
      </Card>

      <Card className="sticky top-0 z-10 flex flex-wrap items-center gap-2 p-3 shadow-sm">
        <ArticlePicker
          buttonLabel="Artikel toevoegen"
          onPick={(a, src) => insertSinglePick(a, src, null)}
        />
        <Button variant="outline" onClick={() => setManualOpen({ categoryId: null })}>
          <Plus className="h-4 w-4" /> Handmatige regel
        </Button>
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <ListPlus className="h-4 w-4" /> Meerdere artikelen
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => normalize.mutate()}
          disabled={normalize.isPending}
          title="Sort_order per categorie netjes hernummeren"
        >
          <Wand2 className="h-3.5 w-3.5" /> Volgorde herstellen
        </Button>
        <span className="ml-auto text-xs text-slate-500">
          {isLoading ? "Laden…" : "Wijzigingen markeren Verkooporder/Aanvulling automatisch als verouderd."}
        </span>
      </Card>

      {grouped.orphans.length > 0 && (
        <CategoryBlock
          title="Zonder categorie"
          warn
          lines={grouped.orphans}
          categories={categories}
          onUpdate={(p) => updateLine.mutate(p)}
          onDelete={(id) => deleteLine.mutate(id)}
          onDuplicate={(id) => duplicateLine.mutate(id)}
          onReorder={(id, dir) => reorder.mutate({ id, dir })}
          onMoveCategory={(id, categoryId) => moveCategory.mutate({ id, categoryId })}
          onAddArticle={() => setPickerForCategory("__none__")}
          onAddManual={() => setManualOpen({ categoryId: null })}
        />
      )}

      {grouped.blocks.map((b) => (
        <CategoryBlock
          key={b.name}
          title={b.name}
          lines={b.lines}
          categories={categories}
          onUpdate={(p) => updateLine.mutate(p)}
          onDelete={(id) => deleteLine.mutate(id)}
          onDuplicate={(id) => duplicateLine.mutate(id)}
          onReorder={(id, dir) => reorder.mutate({ id, dir })}
          onMoveCategory={(id, categoryId) => moveCategory.mutate({ id, categoryId })}
          onAddArticle={() => setPickerForCategory(b.category?.id ?? null)}
          onAddManual={() => setManualOpen({ categoryId: b.category?.id ?? null })}
        />
      ))}

      {pickerForCategory !== null && (
        <CategoryArticleDialog
          categoryName={
            pickerForCategory === "__none__"
              ? "Zonder categorie"
              : categories.find((c) => c.id === pickerForCategory)?.name ?? ""
          }
          onClose={() => setPickerForCategory(null)}
          onPick={(a, src) => {
            const catId = pickerForCategory === "__none__" ? null : pickerForCategory;
            insertSinglePick(a, src, catId);
            setPickerForCategory(null);
          }}
        />
      )}

      {manualOpen && (
        <ManualLineDialog
          categories={categories}
          defaultCategoryId={manualOpen.categoryId}
          onClose={() => setManualOpen(null)}
          onSave={(row) => {
            bulkInsert.mutate([row]);
            setManualOpen(null);
          }}
        />
      )}

      {bulkOpen && (
        <BulkAddDialog
          onClose={() => setBulkOpen(false)}
          onInsert={(rows) => {
            bulkInsert.mutate(rows, {
              onSuccess: (d: any) => toast.success(`${d?.inserted ?? rows.length} regels toegevoegd`),
            });
            setBulkOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- helpers / UI bits ----------
function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", warn && "text-amber-600")}>
        {value}
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function CategoryBlock({
  title,
  lines,
  warn,
  categories,
  onUpdate,
  onDelete,
  onDuplicate,
  onReorder,
  onMoveCategory,
  onAddArticle,
  onAddManual,
}: {
  title: string;
  lines: Line[];
  warn?: boolean;
  categories: Category[];
  onUpdate: (p: Partial<Line> & { id: string }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, dir: "up" | "down") => void;
  onMoveCategory: (id: string, categoryId: string) => void;
  onAddArticle: () => void;
  onAddManual: () => void;
}) {
  const [open, setOpen] = useState(true);
  const withQty = lines.filter((l) => Number(l.total_quantity) > 0).length;
  const missing = lines.filter((l) => Number(l.total_quantity) > 0 && !l.article_number).length;

  return (
    <Card className="overflow-hidden p-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
          <CollapsibleTrigger className="flex flex-1 items-center gap-3 text-left">
            <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
            <span className={cn("font-semibold", warn && "text-amber-700")}>{title}</span>
            <Badge variant="secondary">{lines.length} regels</Badge>
            {withQty > 0 && <Badge variant="outline">{withQty} {">"} 0</Badge>}
            {missing > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {missing} zonder artikelnr
              </Badge>
            )}
          </CollapsibleTrigger>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onAddArticle}>
              <Plus className="h-3.5 w-3.5" /> Artikel
            </Button>
            <Button size="sm" variant="ghost" onClick={onAddManual}>
              <Pencil className="h-3.5 w-3.5" /> Handmatig
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          {lines.length === 0 ? (
            <div className="border-t px-4 py-6 text-center text-xs text-slate-400">
              Geen regels in deze categorie.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr className="border-t">
                    <th className="px-2 py-2 w-10">#</th>
                    <th className="px-2 py-2">Artikelnr</th>
                    <th className="px-2 py-2">Omschrijving</th>
                    <th className="px-2 py-2 w-16">Eenh.</th>
                    <th className="px-2 py-2 w-20 text-right">Aantal</th>
                    <th className="px-2 py-2 w-20 text-right">Verbruikt</th>
                    <th className="px-2 py-2 w-20 text-right">Retour</th>
                    <th className="px-2 py-2 w-20 text-right">Totaal</th>
                    <th className="px-2 py-2 w-28">Charge/haspel</th>
                    <th className="px-2 py-2">Opmerking</th>
                    <th className="px-2 py-2 w-24">Bron / Liander</th>
                    <th className="px-2 py-2 w-32 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <LineRow
                      key={l.id}
                      line={l}
                      categories={categories}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onReorder={onReorder}
                      onMoveCategory={onMoveCategory}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function LineRow({
  line: l,
  categories,
  onUpdate,
  onDelete,
  onDuplicate,
  onReorder,
  onMoveCategory,
}: {
  line: Line;
  categories: Category[];
  onUpdate: (p: Partial<Line> & { id: string }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, dir: "up" | "down") => void;
  onMoveCategory: (id: string, categoryId: string) => void;
}) {
  const negative = Number(l.total_quantity) < 0;
  const missingArt = !l.article_number && Number(l.total_quantity) > 0;
  const isManual = l.is_manual && (l.source_rule === "manual" || !l.article_id);

  return (
    <tr
      className={cn(
        "border-t align-top",
        missingArt && "bg-amber-50/60",
        negative && "bg-red-50/60",
      )}
    >
      <td className="px-2 py-1.5 text-xs text-slate-400 tabular-nums">{l.sort_order}</td>
      <td className="px-2 py-1.5 font-mono text-xs">
        {isManual ? (
          <TextCell
            value={l.article_number ?? ""}
            placeholder="—"
            onChange={(v) => onUpdate({ id: l.id, article_number: v || (null as any) })}
          />
        ) : (
          <div className="flex items-center gap-1">
            {l.article_number || (
              <span className="text-amber-600">
                <AlertTriangle className="inline h-3 w-3" /> ontbreekt
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5">
        {isManual ? (
          <TextCell
            value={l.description ?? ""}
            placeholder="omschrijving"
            onChange={(v) => onUpdate({ id: l.id, description: v || (null as any) })}
          />
        ) : (
          l.description || "—"
        )}
      </td>
      <td className="px-2 py-1.5 text-slate-500">
        {isManual ? (
          <TextCell
            value={l.unit ?? ""}
            placeholder="—"
            onChange={(v) => onUpdate({ id: l.id, unit: v || (null as any) })}
          />
        ) : (
          l.unit || ""
        )}
      </td>
      <td className="px-2 py-1.5">
        <NumberCell value={l.quantity} onChange={(v) => onUpdate({ id: l.id, quantity: v })} />
      </td>
      <td className="px-2 py-1.5">
        <NumberCell value={l.used_quantity} onChange={(v) => onUpdate({ id: l.id, used_quantity: v })} />
      </td>
      <td className="px-2 py-1.5">
        <NumberCell value={l.return_quantity} onChange={(v) => onUpdate({ id: l.id, return_quantity: v })} />
      </td>
      <td className={cn("px-2 py-1.5 text-right font-medium tabular-nums", negative && "text-red-600")}>
        {Number(l.total_quantity)}
      </td>
      <td className="px-2 py-1.5">
        <TextCell
          value={l.charge_or_haspel_number ?? ""}
          placeholder="—"
          onChange={(v) => onUpdate({ id: l.id, charge_or_haspel_number: v || (null as any) })}
        />
      </td>
      <td className="px-2 py-1.5">
        <TextCell
          value={l.note ?? ""}
          placeholder="—"
          onChange={(v) => onUpdate({ id: l.id, note: v || (null as any) })}
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-col gap-1">
          <SourceBadge source={l.source_rule} />
          <LianderBadge status={l.liander_status} />
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex items-center">
          <Button size="icon" variant="ghost" onClick={() => onReorder(l.id, "up")} title="Omhoog">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onReorder(l.id, "down")} title="Omlaag">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <MoveCategoryButton
            categories={categories}
            currentId={l.category_id}
            onPick={(catId) => onMoveCategory(l.id, catId)}
          />
          <Button size="icon" variant="ghost" onClick={() => onDuplicate(l.id)} title="Dupliceren">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete(l.id)} title="Verwijderen">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const s = (source ?? "").toLowerCase();
  if (s === "liander") return <Badge variant="outline" className="text-[10px]">Liander</Badge>;
  if (s === "articles") return <Badge variant="outline" className="text-[10px]">Artikelbestand</Badge>;
  if (s === "manual" || s === "manual_add")
    return <Badge variant="outline" className="text-[10px]">Handmatig</Badge>;
  if (s.startsWith("auto")) return <Badge variant="outline" className="text-[10px]">Auto</Badge>;
  return <Badge variant="outline" className="text-[10px] text-slate-400">—</Badge>;
}

function LianderBadge({ status }: { status: LianderStatus }) {
  if (status === "active")
    return <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">Liander actief</Badge>;
  if (status === "inactive")
    return <Badge variant="destructive" className="text-[10px]">Liander inactief</Badge>;
  if (status === "not_found")
    return (
      <Badge variant="destructive" className="bg-amber-600 text-[10px] hover:bg-amber-600">
        Niet in Liander
      </Badge>
    );
  return <Badge variant="outline" className="text-[10px] text-slate-400">—</Badge>;
}

function MoveCategoryButton({
  categories,
  currentId,
  onPick,
}: {
  categories: Category[];
  currentId: string | null;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" title="Verplaats naar categorie">
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="max-h-72 overflow-y-auto">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onPick(c.id);
                setOpen(false);
              }}
              className={cn(
                "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100",
                c.id === currentId && "font-semibold text-primary",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NumberCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? 0));
  useEffect(() => {
    setV(String(value ?? 0));
  }, [value]);
  return (
    <Input
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = v === "" ? 0 : Number(v);
        if (!Number.isNaN(n) && n !== Number(value)) onChange(n);
      }}
      className="h-7 text-right tabular-nums"
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
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <Input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onChange(v)}
      className="h-7"
    />
  );
}

// ---------- Server-side article picker ----------
function ArticlePicker({
  buttonLabel,
  onPick,
}: {
  buttonLabel: string;
  onPick: (a: any, source: "articles" | "liander") => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<SourceFilter>("all");
  const [pageArt, setPageArt] = useState(0);
  const [pageLia, setPageLia] = useState(0);

  const term = useDebounced(q.trim(), 300);
  useEffect(() => {
    setPageArt(0);
    setPageLia(0);
  }, [term, src]);

  const showArticles = src === "all" || src === "articles";
  const showLianderActive = src === "all" || src === "liander_active";
  const showLianderInactive = src === "liander_inactive";

  const articlesQ = useQuery({
    queryKey: ["picker-articles", term, pageArt],
    enabled: open && term.length >= 1 && showArticles,
    queryFn: async () => {
      const t = `%${term}%`;
      const from = pageArt * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("articles")
        .select("id, article_number, description, unit, category_id, category_code")
        .eq("active", true)
        .or(`article_number.ilike.${t},description.ilike.${t}`)
        .order("article_number")
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lianderQ = useQuery({
    queryKey: ["picker-liander", term, src, pageLia],
    enabled:
      open && term.length >= 1 && (showLianderActive || showLianderInactive),
    queryFn: async () => {
      const t = `%${term}%`;
      const from = pageLia * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let qb = supabase
        .from("liander_assortment_items")
        .select("id, article_number, description, unit, active")
        .or(`article_number.ilike.${t},description.ilike.${t}`)
        .order("article_number")
        .range(from, to);
      if (showLianderActive && !showLianderInactive) qb = qb.eq("active", true);
      if (showLianderInactive) qb = qb.eq("active", false);
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[680px] p-0" align="start">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek op artikelnummer of omschrijving"
              className="pl-8"
            />
            {q !== term && (
              <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>
          <Select value={src} onValueChange={(v) => setSrc(v as SourceFilter)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle bronnen</SelectItem>
              <SelectItem value="articles">Artikelbestand</SelectItem>
              <SelectItem value="liander_active">Liander actief</SelectItem>
              <SelectItem value="liander_inactive">Liander inactief</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[440px] overflow-y-auto">
          {term.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500">
              Begin met typen om te zoeken (server-side, max {PAGE_SIZE} per bron per pagina).
            </div>
          )}

          {showArticles && term.length > 0 && (
            <PickerSection
              title="Artikelbestand"
              loading={articlesQ.isLoading || articlesQ.isFetching}
              rows={articlesQ.data ?? []}
              onPick={(r) => {
                onPick(r, "articles");
                setOpen(false);
                setQ("");
              }}
              hasMore={(articlesQ.data ?? []).length === PAGE_SIZE}
              onMore={() => setPageArt((p) => p + 1)}
              page={pageArt}
            />
          )}

          {(showLianderActive || showLianderInactive) && term.length > 0 && (
            <PickerSection
              title={
                showLianderInactive
                  ? "Liander Assortimentslijst (inactief)"
                  : "Liander Assortimentslijst (actief)"
              }
              loading={lianderQ.isLoading || lianderQ.isFetching}
              rows={lianderQ.data ?? []}
              renderExtra={(r) =>
                r.active === false ? (
                  <Badge variant="destructive" className="text-[10px]">inactief</Badge>
                ) : null
              }
              onPick={(r) => {
                if (r.active === false) {
                  toast.warning(
                    "Dit artikel staat niet actief in de huidige Liander Assortimentslijst.",
                  );
                  return;
                }
                onPick(r, "liander");
                setOpen(false);
                setQ("");
              }}
              hasMore={(lianderQ.data ?? []).length === PAGE_SIZE}
              onMore={() => setPageLia((p) => p + 1)}
              page={pageLia}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PickerSection({
  title,
  loading,
  rows,
  onPick,
  renderExtra,
  hasMore,
  onMore,
  page,
}: {
  title: string;
  loading: boolean;
  rows: any[];
  onPick: (r: any) => void;
  renderExtra?: (r: any) => React.ReactNode;
  hasMore?: boolean;
  onMore?: () => void;
  page?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span>{title}</span>
        {typeof page === "number" && page > 0 && (
          <span className="text-slate-400">pagina {page + 1}</span>
        )}
      </div>
      {loading && <div className="px-3 py-2 text-xs text-slate-500">Laden…</div>}
      {!loading && rows.length === 0 && (
        <div className="px-3 py-2 text-xs text-slate-400">Geen resultaten.</div>
      )}
      {rows.map((r) => (
        <button
          key={r.id}
          onClick={() => onPick(r)}
          className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
        >
          <div>
            <div className="font-mono text-xs text-slate-500">{r.article_number}</div>
            <div>{r.description || "—"}</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {renderExtra?.(r)}
            <span>{r.unit}</span>
          </div>
        </button>
      ))}
      {hasMore && onMore && (
        <button
          onClick={onMore}
          className="block w-full border-t px-3 py-2 text-center text-xs text-primary hover:bg-slate-50"
        >
          Meer laden
        </button>
      )}
    </div>
  );
}

function CategoryArticleDialog({
  categoryName,
  onClose,
  onPick,
}: {
  categoryName: string;
  onClose: () => void;
  onPick: (a: any, source: "articles" | "liander") => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Artikel toevoegen aan: {categoryName}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-slate-500">
          Het gekozen artikel wordt geplaatst in deze categorie.
        </div>
        <div>
          <ArticlePicker buttonLabel="Zoeken" onPick={onPick} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualLineDialog({
  categories,
  defaultCategoryId,
  onClose,
  onSave,
}: {
  categories: Category[];
  defaultCategoryId: string | null;
  onClose: () => void;
  onSave: (row: any) => void;
}) {
  const [artno, setArtno] = useState("");
  const [desc, setDesc] = useState("");
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState("0");
  const [used, setUsed] = useState("0");
  const [ret, setRet] = useState("0");
  const [note, setNote] = useState("");
  const [catId, setCatId] = useState<string | null>(defaultCategoryId);

  const q = Number(qty) || 0;
  const r = Number(ret) || 0;
  const total = q - r;
  const missingArtWarn = !artno.trim() && total > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Handmatige regel toevoegen</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Artikelnummer">
            <Input value={artno} onChange={(e) => setArtno(e.target.value)} />
          </Field>
          <Field label="Eenheid">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="Omschrijving" full>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <Field label="Categorie" full>
            <Select
              value={catId ?? "__none"}
              onValueChange={(v) => setCatId(v === "__none" ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Kies categorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Geen —</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Aantal">
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Verbruikt">
            <Input type="number" value={used} onChange={(e) => setUsed(e.target.value)} />
          </Field>
          <Field label="Retour">
            <Input type="number" value={ret} onChange={(e) => setRet(e.target.value)} />
          </Field>
          <Field label="Totaal">
            <Input value={String(total)} disabled className="tabular-nums" />
          </Field>
          <Field label="Opmerking" full>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {missingArtWarn && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="mr-1 inline h-3 w-3" /> Artikelnummer is verplicht zodra het totaal &gt; 0 is.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button
            onClick={() =>
              onSave({
                article_number: artno.trim() || null,
                description: desc.trim() || null,
                unit: unit.trim() || null,
                category_id: catId,
                category_code: null,
                quantity: q,
                used_quantity: Number(used) || 0,
                return_quantity: r,
                total_quantity: total,
                note: note.trim() || null,
                is_manual: true,
                is_auto_generated: false,
                source_rule: "manual",
              })
            }
          >
            Toevoegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("space-y-1", full && "col-span-2")}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      {children}
    </div>
  );
}

// ---------- Bulk add via RPC ----------
function BulkAddDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (rows: any[]) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    found: any[];
    notFound: { artno: string; qty: number }[];
  } | null>(null);

  const parseInput = () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .map((l) => {
        const parts = l.split(/[;,\t\s]+/).map((p) => p.trim()).filter(Boolean);
        const artno = parts[0] ?? "";
        const qty = Number((parts[1] ?? "1").replace(",", "."));
        return { artno, qty: Number.isFinite(qty) ? qty : 1 };
      })
      .filter((r) => r.artno.length > 0);
  };

  const lookup = async () => {
    setBusy(true);
    try {
      const parsed = parseInput();
      if (parsed.length === 0) {
        toast.warning("Geen regels gevonden om te verwerken.");
        return;
      }
      const numbers = [...new Set(parsed.map((p) => p.artno))];
      const { data, error } = await (supabase as any).rpc("lookup_material_articles", {
        p_article_numbers: numbers,
      });
      if (error) throw error;

      const lookupMap = new Map<string, any>();
      for (const r of data ?? []) lookupMap.set(r.article_number, r);

      const found: any[] = [];
      const notFound: { artno: string; qty: number }[] = [];
      for (const p of parsed) {
        const hit = lookupMap.get(p.artno);
        if (hit && hit.found && (hit.source === "articles" || hit.source === "both" || hit.source === "liander")) {
          found.push({
            article_id: hit.article_id ?? null,
            article_number: hit.article_number,
            description: hit.description,
            unit: hit.unit,
            category_id: hit.category_id ?? null,
            category_code: hit.category_code ?? null,
            quantity: p.qty,
            used_quantity: 0,
            return_quantity: 0,
            total_quantity: p.qty,
            is_manual: false,
            is_auto_generated: false,
            source_rule: hit.source === "articles" || hit.source === "both" ? "articles" : "liander",
          });
        } else {
          notFound.push(p);
        }
      }
      setResult({ found, notFound });
    } catch (e: any) {
      toast.error(e.message ?? "Zoekfout");
    } finally {
      setBusy(false);
    }
  };

  const insertFound = () => {
    if (!result || result.found.length === 0) return;
    onInsert(result.found);
  };

  const insertNotFoundManual = () => {
    if (!result) return;
    const rows = result.notFound.map((p) => ({
      article_id: null,
      article_number: p.artno,
      description: null,
      unit: null,
      category_id: null,
      category_code: null,
      quantity: p.qty,
      used_quantity: 0,
      return_quantity: 0,
      total_quantity: p.qty,
      is_manual: true,
      is_auto_generated: false,
      source_rule: "manual",
    }));
    onInsert(rows);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Meerdere artikelen toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-xs text-slate-500">
          Plak regels in het formaat <code>artikelnummer;aantal</code>,{" "}
          <code>artikelnummer,aantal</code> of gescheiden door spatie/tab. Aantal optioneel (default 1).
          Lookup gebeurt server-side in artikelbestand + actieve Liander.
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={`12345678;5\n87654321,2\n55555555 1`}
          className="font-mono text-sm"
        />
        <div className="flex gap-2">
          <Button onClick={lookup} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Zoeken…" : "Zoeken in bronnen"}
          </Button>
          {result && (
            <>
              <Button onClick={insertFound} disabled={result.found.length === 0}>
                {result.found.length} gevonden toevoegen
              </Button>
              {result.notFound.length > 0 && (
                <Button variant="outline" onClick={insertNotFoundManual}>
                  {result.notFound.length} niet-gevonden als handmatige regels
                </Button>
              )}
            </>
          )}
        </div>
        {result && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                Gevonden ({result.found.length})
              </div>
              <div className="max-h-48 overflow-y-auto rounded border bg-slate-50 p-2 text-xs">
                {result.found.length === 0 && <div className="text-slate-400">—</div>}
                {result.found.map((r, i) => (
                  <div key={i} className="font-mono">
                    {r.article_number} ×{r.quantity}{" "}
                    <span className="text-slate-400">({r.source_rule})</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                Niet gevonden ({result.notFound.length})
              </div>
              <div className="max-h-48 overflow-y-auto rounded border bg-amber-50 p-2 text-xs">
                {result.notFound.length === 0 && <div className="text-slate-400">—</div>}
                {result.notFound.map((r, i) => (
                  <div key={i} className="font-mono">{r.artno} ×{r.qty}</div>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
