import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Search, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseLianderFile, type ParseResult } from "@/lib/liander-parser";

export const Route = createFileRoute("/liander")({ component: LianderPage });

type PreviewState = {
  file: File;
  parsed: ParseResult;
  diff: {
    new_count: number;
    update_count: number;
    inactive_count: number;
    new_articles: string[];
    inactive_articles: string[];
  };
};

function LianderPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["liander-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liander_assortment_items")
        .select("*")
        .order("article_number")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: imports = [] } = useQuery({
    queryKey: ["liander-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liander_assortment_imports")
        .select("*")
        .order("import_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const active = items.filter((i: any) => i.active).length;
    const inactive = items.length - active;
    const last = imports[0] as any | undefined;
    return {
      active,
      inactive,
      last_date: last?.import_date,
      last_file: last?.file_name,
      last_new: last?.new_items_count ?? 0,
      last_updated: last?.updated_items_count ?? 0,
      last_inactive: last?.inactive_items_count ?? 0,
    };
  }, [items, imports]);

  const filtered = items.filter((it: any) => {
    if (activeFilter === "active" && !it.active) return false;
    if (activeFilter === "inactive" && it.active) return false;
    if (
      q &&
      !`${it.article_number} ${it.description ?? ""}`.toLowerCase().includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const parsed = await parseLianderFile(file);
      // Compute diff against current active items
      const { data: existing, error } = await supabase
        .from("liander_assortment_items")
        .select("article_number, active");
      if (error) throw error;
      const existingMap = new Map<string, boolean>(
        (existing ?? []).map((e: any) => [e.article_number, e.active]),
      );
      const incomingSet = new Set(parsed.rows.map((r) => r.article_number));
      let new_count = 0;
      let update_count = 0;
      const new_articles: string[] = [];
      for (const r of parsed.rows) {
        if (existingMap.has(r.article_number)) update_count++;
        else {
          new_count++;
          if (new_articles.length < 20) new_articles.push(r.article_number);
        }
      }
      const inactive_articles: string[] = [];
      let inactive_count = 0;
      for (const [art, wasActive] of existingMap.entries()) {
        if (wasActive && !incomingSet.has(art)) {
          inactive_count++;
          if (inactive_articles.length < 20) inactive_articles.push(art);
        }
      }
      setPreview({
        file,
        parsed,
        diff: { new_count, update_count, inactive_count, new_articles, inactive_articles },
      });
    } catch (e: any) {
      toast.error(e.message ?? "Kon bestand niet lezen");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function commitImport() {
    if (!preview) return;
    setCommitting(true);
    const { file, parsed, diff } = preview;

    // 1. Create import row (status=processing)
    const { data: importRow, error: impErr } = await supabase
      .from("liander_assortment_imports")
      .insert({
        file_name: file.name,
        imported_by: "system",
        total_rows: parsed.total_rows,
        new_items_count: 0,
        updated_items_count: 0,
        inactive_items_count: 0,
        status: "processing",
        sheet_name: parsed.sheet_name,
        header_row_index: parsed.header_row_index,
        skipped_rows_count: parsed.skipped_rows,
        warnings: parsed.warnings.length ? parsed.warnings : null,
      })
      .select()
      .single();
    if (impErr || !importRow) {
      toast.error("Kon import niet starten: " + impErr?.message);
      setCommitting(false);
      return;
    }

    try {
      // 2. Fetch existing rows (id+article_number) to map upserts
      const { data: existing, error: exErr } = await supabase
        .from("liander_assortment_items")
        .select("id, article_number, active");
      if (exErr) throw exErr;
      const exMap = new Map<string, { id: string; active: boolean }>(
        (existing ?? []).map((e: any) => [e.article_number, { id: e.id, active: e.active }]),
      );
      const incomingSet = new Set(parsed.rows.map((r) => r.article_number));

      const inserts: any[] = [];
      const updates: { id: string; patch: any }[] = [];

      for (const r of parsed.rows) {
        const ex = exMap.get(r.article_number);
        const payload = {
          import_id: importRow.id,
          article_number: r.article_number,
          description: r.description,
          unit: r.unit,
          customer_quantity_field_name: r.customer_quantity_field_name,
          active: true,
          raw_data: r.raw_data,
        };
        if (ex) updates.push({ id: ex.id, patch: payload });
        else inserts.push(payload);
      }

      // 3. Insert new (in chunks)
      const CHUNK = 500;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const slice = inserts.slice(i, i + CHUNK);
        const { error } = await supabase.from("liander_assortment_items").insert(slice);
        if (error) throw error;
      }

      // 4. Update existing one-by-one (small N typically; fine for this stage)
      for (const u of updates) {
        const { error } = await supabase
          .from("liander_assortment_items")
          .update(u.patch)
          .eq("id", u.id);
        if (error) throw error;
      }

      // 5. Mark inactive: previously active but not in new import
      const inactiveIds: string[] = [];
      for (const [art, ex] of exMap.entries()) {
        if (ex.active && !incomingSet.has(art)) inactiveIds.push(ex.id);
      }
      if (inactiveIds.length > 0) {
        for (let i = 0; i < inactiveIds.length; i += CHUNK) {
          const slice = inactiveIds.slice(i, i + CHUNK);
          const { error } = await supabase
            .from("liander_assortment_items")
            .update({ active: false })
            .in("id", slice);
          if (error) throw error;
        }
      }

      // 6. Finalize import row
      await supabase
        .from("liander_assortment_imports")
        .update({
          status: "completed",
          new_items_count: diff.new_count,
          updated_items_count: diff.update_count,
          inactive_items_count: inactiveIds.length,
        })
        .eq("id", importRow.id);

      toast.success(
        `Import voltooid: ${diff.new_count} nieuw, ${diff.update_count} bijgewerkt, ${inactiveIds.length} inactief.`,
      );
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["liander-items"] });
      qc.invalidateQueries({ queryKey: ["liander-imports"] });
    } catch (e: any) {
      await supabase
        .from("liander_assortment_imports")
        .update({ status: "failed", error_message: e?.message ?? String(e) })
        .eq("id", importRow.id);
      toast.error("Import mislukt: " + (e?.message ?? String(e)));
      qc.invalidateQueries({ queryKey: ["liander-imports"] });
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Liander Assortimentslijst</h1>
          <p className="text-sm text-slate-500">
            Maandelijks door Liander aangeleverde lijst — basis voor de Aanvulling-tab in cases.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {parsing ? "Inlezen…" : "Nieuwe Liander-lijst importeren"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Actieve artikelen" value={stats.active} />
        <StatCard label="Inactieve artikelen" value={stats.inactive} />
        <StatCard
          label="Laatste import"
          value={stats.last_date ? new Date(stats.last_date).toLocaleString("nl-NL") : "—"}
          mono
        />
        <StatCard label="Laatste bestand" value={stats.last_file ?? "—"} mono />
        <StatCard label="Nieuw bij laatste import" value={stats.last_new} />
        <StatCard label="Bijgewerkt bij laatste import" value={stats.last_updated} />
        <StatCard label="Inactief bij laatste import" value={stats.last_inactive} />
      </div>

      {/* Importgeschiedenis */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Importgeschiedenis</h2>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Bestand</th>
                <th className="px-4 py-2">Tabblad</th>
                <th className="px-4 py-2 text-right">Totaal</th>
                <th className="px-4 py-2 text-right">Nieuw</th>
                <th className="px-4 py-2 text-right">Gewijzigd</th>
                <th className="px-4 py-2 text-right">Inactief</th>
                <th className="px-4 py-2 text-right">Skipped</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {imports.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Nog geen imports.
                  </td>
                </tr>
              )}
              {imports.map((i: any) => (
                <tr key={i.id} className="border-t align-top">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(i.import_date).toLocaleString("nl-NL")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{i.file_name}</td>
                  <td className="px-4 py-2 text-xs">{i.sheet_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{i.total_rows}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{i.new_items_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{i.updated_items_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{i.inactive_items_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{i.skipped_rows_count ?? 0}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant="outline"
                      className={
                        i.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : i.status === "failed"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-slate-50 text-slate-600"
                      }
                    >
                      {i.status}
                    </Badge>
                    {i.error_message && (
                      <div className="mt-1 max-w-xs text-xs text-red-600">{i.error_message}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Filter + table */}
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
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Artikelnr</th>
              <th className="px-4 py-2">Omschrijving</th>
              <th className="px-4 py-2">Eenheid</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Laatst gewijzigd</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">Laden…</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  Geen artikelen — importeer eerst een Liander-lijst.
                </td>
              </tr>
            )}
            {filtered.map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{it.article_number}</td>
                <td className="px-4 py-2">{it.description}</td>
                <td className="px-4 py-2 text-slate-500">{it.unit}</td>
                <td className="px-4 py-2">
                  {it.active ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      Actief
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-slate-200">Inactief</Badge>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {it.updated_at ? new Date(it.updated_at).toLocaleString("nl-NL") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Import preview
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Info label="Bestand" value={preview.file.name} mono />
                <Info label="Tabblad" value={preview.parsed.sheet_name} mono />
                <Info label="Header-rij" value={`rij ${preview.parsed.header_row_index + 1}`} />
                <Info label="Totaal gelezen rijen" value={preview.parsed.total_rows} />
                <Info label="Geldige artikelregels" value={preview.parsed.rows.length} />
                <Info label="Overgeslagen rijen" value={preview.parsed.skipped_rows} />
              </div>

              <div className="rounded-md border bg-slate-50 p-3 text-xs">
                <div className="mb-1 font-semibold text-slate-700">Kolommapping</div>
                <div className="grid grid-cols-2 gap-1 font-mono">
                  <span>article_number ←</span>
                  <span>{preview.parsed.column_map.article_number}</span>
                  <span>description ←</span>
                  <span>{preview.parsed.column_map.description ?? "—"}</span>
                  <span>unit ←</span>
                  <span>{preview.parsed.column_map.unit ?? "—"}</span>
                  <span>customer_quantity ←</span>
                  <span>{preview.parsed.column_map.customer_quantity ?? "—"}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <DiffStat label="Nieuw" value={preview.diff.new_count} tone="emerald" />
                <DiffStat label="Bijgewerkt" value={preview.diff.update_count} tone="sky" />
                <DiffStat label="Inactief" value={preview.diff.inactive_count} tone="amber" />
              </div>

              {preview.parsed.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <div className="mb-1 flex items-center gap-1 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" /> Waarschuwingen
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {preview.parsed.warnings.map((w, i) => (<li key={i}>{w}</li>))}
                  </ul>
                </div>
              )}

              {preview.diff.inactive_count > 0 && (
                <div className="rounded-md border bg-slate-50 p-3 text-xs">
                  <div className="font-semibold text-slate-700">
                    Worden inactief gemaakt (eerste 20):
                  </div>
                  <div className="mt-1 font-mono text-slate-500">
                    {preview.diff.inactive_articles.join(", ")}
                    {preview.diff.inactive_count > 20 && " …"}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={committing}>
              Annuleren
            </Button>
            <Button onClick={commitImport} disabled={committing || !preview}>
              {committing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Import definitief verwerken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </div>
    </Card>
  );
}

function Info({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </>
  );
}

function DiffStat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "amber" }) {
  const colors = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return (
    <div className={`rounded-md border p-3 ${colors}`}>
      <div className="text-xs">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
