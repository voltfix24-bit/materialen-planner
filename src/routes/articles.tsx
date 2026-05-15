import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/articles")({ component: ArticlesPage });

const SOURCES = ["VDH", "Liander", "Handmatig", "Anders"];

function ArticlesPage() {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*, categories(name)")
        .order("article_number")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = articles.filter((a: any) => {
    if (activeFilter === "active" && !a.active) return false;
    if (activeFilter === "inactive" && a.active) return false;
    if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
    if (categoryFilter !== "all" && a.category_id !== categoryFilter) return false;
    if (
      q &&
      !`${a.article_number} ${a.description ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Artikelbestand</h1>
          <p className="text-sm text-slate-500">
            Algemene artikellijst voor de werkvoorbereiding.
          </p>
        </div>
        <ArticleDialog
          categories={categories}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          article={editing}
          trigger={
            <Button onClick={() => setEditing({})}>
              <Plus className="h-4 w-4" /> Nieuw artikel
            </Button>
          }
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek artikelnummer of omschrijving"
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
              {categories.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="inactive">Inactief</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle bronnen</SelectItem>
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Artikelnr</th>
              <th className="px-4 py-2">Omschrijving</th>
              <th className="px-4 py-2">Eenheid</th>
              <th className="px-4 py-2">Categorie</th>
              <th className="px-4 py-2">Bron</th>
              <th className="px-4 py-2">Charge/haspel</th>
              <th className="px-4 py-2">Actief</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-slate-400">
                  Laden…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-slate-400">
                  Geen artikelen.
                </td>
              </tr>
            )}
            {filtered.map((a: any) => (
              <tr
                key={a.id}
                className="cursor-pointer border-t hover:bg-slate-50"
                onClick={() => setEditing(a)}
              >
                <td className="px-4 py-2 font-mono text-xs">{a.article_number}</td>
                <td className="px-4 py-2">{a.description}</td>
                <td className="px-4 py-2 text-slate-500">{a.unit}</td>
                <td className="px-4 py-2">{a.categories?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <Badge variant="outline">{a.source}</Badge>
                </td>
                <td className="px-4 py-2">
                  {a.requires_charge_or_haspel ? "Ja" : "Nee"}
                </td>
                <td className="px-4 py-2">
                  {a.active ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      Actief
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-slate-200">
                      Inactief
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ArticleDialog({
  article,
  open,
  onOpenChange,
  trigger,
  categories,
}: {
  article: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger?: React.ReactNode;
  categories: any[];
}) {
  const qc = useQueryClient();
  const isEdit = !!article?.id;
  const [form, setForm] = useState<any>(() => ({
    article_number: "",
    description: "",
    unit: "",
    category_id: null,
    category_code: "",
    sort_order: 0,
    packaging_unit: "",
    requires_charge_or_haspel: false,
    active: true,
    source: "Handmatig",
    note: "",
    ...(article || {}),
  }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      delete payload.categories;
      delete payload.created_at;
      delete payload.updated_at;
      if (isEdit) {
        const { error } = await supabase
          .from("articles")
          .update(payload)
          .eq("id", article.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await supabase.from("articles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      toast.success(isEdit ? "Bijgewerkt" : "Toegevoegd");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Mislukt: " + e.message),
  });

  const set = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Artikel bewerken" : "Nieuw artikel"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Artikelnummer">
            <Input
              value={form.article_number ?? ""}
              onChange={(e) => set("article_number", e.target.value)}
            />
          </Field>
          <Field label="Eenheid">
            <Input value={form.unit ?? ""} onChange={(e) => set("unit", e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Omschrijving">
              <Input
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Categorie">
            <Select
              value={form.category_id ?? ""}
              onValueChange={(v) => {
                const cat = categories.find((c) => c.id === v);
                set("category_id", v);
                if (cat) set("category_code", cat.category_code);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Geen" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Volgorde">
            <Input
              type="number"
              value={form.sort_order ?? 0}
              onChange={(e) => set("sort_order", Number(e.target.value))}
            />
          </Field>
          <Field label="Verpakkingseenheid">
            <Input
              value={form.packaging_unit ?? ""}
              onChange={(e) => set("packaging_unit", e.target.value)}
            />
          </Field>
          <Field label="Bron">
            <Select value={form.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-2 pt-6">
            <Switch
              checked={!!form.requires_charge_or_haspel}
              onCheckedChange={(v) => set("requires_charge_or_haspel", v)}
            />
            <Label>Charge/haspel verplicht</Label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} />
            <Label>Actief</Label>
          </div>
          <div className="col-span-2">
            <Field label="Opmerking">
              <Input value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={() => save.mutate()}>{isEdit ? "Opslaan" : "Toevoegen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
