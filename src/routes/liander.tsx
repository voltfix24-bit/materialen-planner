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
import {
  Upload,
  Search,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  XCircle,
} from "lucide-react";
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
  const [importFilter, setImportFilter] = useState("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [detailImport, setDetailImport] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["liander-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liander_assortment_items")
        .select(
          "*, liander_assortment_imports!liander_assortment_items_import_id_fkey(file_name, import_date)",
        )
        .order("article_number")
        .limit(5000);
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

  const lastCompleted = useMemo(
    () => (imports as any[]).find((i) => i.status === "completed"),
    [imports],
  );
  const lastAttempt = (imports as any[])[0];

  const stats = useMemo(() => {
    const active = items.filter((i: any) => i.active).length;
    const inactive = items.length - active;
    return {
      active,
      inactive,
      last_date: lastCompleted?.import_date,
      last_file: lastCompleted?.file_name,
      last_new: lastCompleted?.new_items_count ?? 0,
      last_updated: lastCompleted?.updated_items_count ?? 0,
      last_inactive: lastCompleted?.inactive_items_count ?? 0,
    };
  }, [items, lastCompleted]);

  const completedImports = useMemo(
    () => (imports as any[]).filter((i) => i.status === "completed"),
    [imports],
  );

  const lastCompletedId = lastCompleted?.id ?? null;

  const filtered = items.filter((it: any) => {
    if (activeFilter === "active" && !it.active) return false;
    if (activeFilter === "inactive" && it.active) return false;
    if (importFilter !== "all" && it.import_id !== importFilter) return false;
    if (changedOnly && (!lastCompletedId || it.import_id !== lastCompletedId)) return false;
    if (
      q &&
      !`${it.article_number} ${it.description ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const parsed = await parseLianderFile(file);

      if (parsed.rows.length === 0) {
        toast.error(
          "Import geblokkeerd: er zijn geen geldige artikelregels gevonden.",
        );
        return;
      }

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
    const { file, parsed } = preview;

    try {
      const { data, error } = await supabase.rpc(
        "process_liander_assortment_import" as any,
        {
          p_file_name: file.name,
          p_sheet_name: parsed.sheet_name,
          p_header_row_index: parsed.header_row_index,
          p_rows: parsed.rows as any,
          p_warnings: parsed.warnings.length ? (parsed.warnings as any) : null,
          p_skipped_rows: parsed.skipped_rows,
          p_total_rows: parsed.total_rows,
          p_imported_by: "system",
        },
      );

      if (error) {
        // DB rolled back — record a failed attempt for visibility
        await supabase.from("liander_assortment_imports").insert({
          file_name: file.name,
          imported_by: "system",
          total_rows: parsed.total_rows,
          status: "failed",
          error_message: error.message,
          sheet_name: parsed.sheet_name,
          header_row_index: parsed.header_row_index,
          skipped_rows_count: parsed.skipped_rows,
          warnings: parsed.warnings.length ? parsed.warnings : null,
        });
        throw error;
      }

      const result = data as any;
      if (result?.status === "failed") {
        toast.error(result.error ?? "Import mislukt");
      } else {
        toast.success(
          `Import voltooid: ${result.new_items_count} nieuw, ${result.updated_items_count} bijgewerkt, ${result.inactive_items_count} inactief.`,
        );
      }
      setPreview(null);
    } catch (e: any) {
      toast.error("Import mislukt: " + (e?.message ?? String(e)));
    } finally {
      setCommitting(false);
      qc.invalidateQueries({ queryKey: ["liander-items"] });
      qc.invalidateQueries({ queryKey: ["liander-imports"] });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Liander Assortimentslijst</h1>
          <p className="text-sm text-slate-500">
            Maandelijks door Liander aangeleverde lijst — basis voor de
            Aanvulling-tab in cases.
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
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {parsing ? "Inlezen…" : "Nieuwe Liander-lijst importeren"}
          </Button>
        </div>
      </div>

      {/* Stats — based on last COMPLETED import */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Actieve lijst (laatste succesvolle import)
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Actieve artikelen" value={stats.active} />
          <StatCard label="Inactieve artikelen" value={stats.inactive} />
          <StatCard
            label="Laatste succesvolle import"
            value={
              stats.last_date
                ? new Date(stats.last_date).toLocaleString("nl-NL")
                : "—"
            }
            mono
          />
          <StatCard label="Bestand" value={stats.last_file ?? "—"} mono />
          <StatCard label="Nieuw" value={stats.last_new} />
          <StatCard label="Bijgewerkt" value={stats.last_updated} />
          <StatCard label="Inactief" value={stats.last_inactive} />
        </div>
      </div>

      {/* Last attempt — separate, only shown if it differs or failed */}
      {lastAttempt && (
        <Card
          className={`p-4 text-sm ${
            lastAttempt.status === "failed"
              ? "border-red-200 bg-red-50"
              : lastAttempt.status === "processing"
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {lastAttempt.status === "failed" ? (
                <XCircle className="h-4 w-4 text-red-600" />
              ) : lastAttempt.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
              )}
              <span className="font-medium">Laatste importpoging:</span>
              <span className="font-mono text-xs">{lastAttempt.file_name}</span>
              <span className="text-xs text-slate-500">
                {new Date(lastAttempt.import_date).toLocaleString("nl-NL")}
              </span>
              <Badge variant="outline" className="capitalize">
                {lastAttempt.status}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetailImport(lastAttempt)}
            >
              Details
            </Button>
          </div>
          {lastAttempt.error_message && (
            <div className="mt-2 text-xs text-red-700">
              {lastAttempt.error_message}
            </div>
          )}
        </Card>
      )}

      {/* Importgeschiedenis */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Importgeschiedenis
        </h2>
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
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {imports.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Nog geen imports.
                  </td>
                </tr>
              )}
              {(imports as any[]).map((i) => (
                <tr
                  key={i.id}
                  className="border-t cursor-pointer hover:bg-slate-50"
                  onClick={() => setDetailImport(i)}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(i.import_date).toLocaleString("nl-NL")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{i.file_name}</td>
                  <td className="px-4 py-2 text-xs">{i.sheet_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.total_rows}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.new_items_count}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.updated_items_count}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.inactive_items_count}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.skipped_rows_count ?? 0}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm">
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Filters */}
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
          <Select value={importFilter} onValueChange={setImportFilter}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Filter op import" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle imports</SelectItem>
              {completedImports.map((i: any) => (
                <SelectItem key={i.id} value={i.id}>
                  {new Date(i.import_date).toLocaleDateString("nl-NL")} —{" "}
                  {i.file_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Items table */}
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Artikelnr</th>
              <th className="px-4 py-2">Omschrijving</th>
              <th className="px-4 py-2">Eenheid</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Laatste import</th>
              <th className="px-4 py-2">Laatst gewijzigd</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-400">
                  Laden…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-400">
                  Geen artikelen — importeer eerst een Liander-lijst.
                </td>
              </tr>
            )}
            {filtered.map((it: any) => {
              const imp = it.liander_assortment_imports;
              return (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">
                    {it.article_number}
                  </td>
                  <td className="px-4 py-2">{it.description}</td>
                  <td className="px-4 py-2 text-slate-500">{it.unit}</td>
                  <td className="px-4 py-2">
                    {it.active ? (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-100 text-emerald-700"
                      >
                        Actief
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-slate-200">
                        Inactief
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {imp ? (
                      <>
                        <div className="font-mono">{imp.file_name}</div>
                        <div className="text-slate-500">
                          {new Date(imp.import_date).toLocaleDateString("nl-NL")}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {it.updated_at
                      ? new Date(it.updated_at).toLocaleString("nl-NL")
                      : "—"}
                  </td>
                </tr>
              );
            })}
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
                <Info
                  label="Header-rij"
                  value={`rij ${preview.parsed.header_row_index + 1}`}
                />
                <Info label="Totaal gelezen rijen" value={preview.parsed.total_rows} />
                <Info label="Geldige artikelregels" value={preview.parsed.rows.length} />
                <Info label="Overgeslagen rijen" value={preview.parsed.skipped_rows} />
              </div>

              <div className="rounded-md border bg-slate-50 p-3 text-xs">
                <div className="mb-1 font-semibold text-slate-700">
                  Kolommapping
                </div>
                <div className="grid grid-cols-2 gap-1 font-mono">
                  <span>article_number ←</span>
                  <span>{preview.parsed.column_map.article_number}</span>
                  <span>description ←</span>
                  <span>{preview.parsed.column_map.description ?? "—"}</span>
                  <span>unit ←</span>
                  <span>{preview.parsed.column_map.unit ?? "—"}</span>
                  <span>customer_quantity ←</span>
                  <span>
                    {preview.parsed.column_map.customer_quantity ?? "—"}
                  </span>
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
                    {preview.parsed.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
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
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={committing}
            >
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

      {/* Import detail dialog */}
      <Dialog open={!!detailImport} onOpenChange={(o) => !o && setDetailImport(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Importdetails</DialogTitle>
          </DialogHeader>
          {detailImport && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Info label="Bestand" value={detailImport.file_name} mono />
                <Info
                  label="Datum"
                  value={new Date(detailImport.import_date).toLocaleString("nl-NL")}
                />
                <Info label="Status" value={<StatusBadge status={detailImport.status} />} />
                <Info label="Imported by" value={detailImport.imported_by ?? "—"} />
                <Info label="Sheet" value={detailImport.sheet_name ?? "—"} mono />
                <Info
                  label="Header-rij"
                  value={
                    detailImport.header_row_index != null
                      ? `rij ${detailImport.header_row_index + 1}`
                      : "—"
                  }
                />
                <Info label="Totaal rijen" value={detailImport.total_rows} />
                <Info label="Skipped" value={detailImport.skipped_rows_count ?? 0} />
                <Info label="Nieuw" value={detailImport.new_items_count} />
                <Info label="Bijgewerkt" value={detailImport.updated_items_count} />
                <Info label="Inactief" value={detailImport.inactive_items_count} />
              </div>

              {detailImport.error_message && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <div className="mb-1 font-semibold">Foutmelding</div>
                  <div>{detailImport.error_message}</div>
                </div>
              )}

              {Array.isArray(detailImport.warnings) &&
                detailImport.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <div className="mb-1 font-semibold">Waarschuwingen</div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {detailImport.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailImport(null)}>
              Sluiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "failed"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-slate-50 text-slate-600";
  return (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
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

function DiffStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "amber";
}) {
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
