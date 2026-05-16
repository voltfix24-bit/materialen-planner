import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Trash2, Eye, Power } from "lucide-react";
import { parseTemplateFile, type TemplateParseResult } from "@/lib/template-parser";

export const Route = createFileRoute("/templates")({
  component: TemplatesPage,
});

type Template = {
  id: string;
  name: string;
  version: string | null;
  source_file_name: string | null;
  source_sheet_name: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function TemplatesPage() {
  const qc = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["material_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["material_templates_counts", templates.map((t) => t.id)],
    enabled: templates.length > 0,
    queryFn: async () => {
      const out: Record<string, { total: number; articles: number; formulas: number }> = {};
      for (const t of templates) {
        const { data } = await supabase
          .from("material_template_lines")
          .select("is_section_header,is_formula_quantity,total_formula_text")
          .eq("template_id", t.id);
        const rows = data ?? [];
        out[t.id] = {
          total: rows.length,
          articles: rows.filter((r: any) => !r.is_section_header).length,
          formulas: rows.filter((r: any) => r.is_formula_quantity || r.total_formula_text).length,
        };
      }
      return out;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (t: Template) => {
      const { error } = await supabase
        .from("material_templates")
        .update({ active: !t.active })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material_templates"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("material_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template verwijderd");
      qc.invalidateQueries({ queryKey: ["material_templates"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Verwijderen mislukt"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Materiaalstaat templates</h1>
          <p className="text-sm text-slate-500">
            Vaste TerreVolt template-opbouw (categorieën, regels, formules als metadata).
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Template importeren
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Versie</TableHead>
              <TableHead>Bronbestand</TableHead>
              <TableHead className="text-right">Regels</TableHead>
              <TableHead className="text-right">Artikelen</TableHead>
              <TableHead className="text-right">Formules</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aangemaakt</TableHead>
              <TableHead className="w-[160px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="text-sm text-slate-500">Laden…</TableCell></TableRow>
            )}
            {!isLoading && templates.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-sm text-slate-500">Nog geen templates. Importeer er één.</TableCell></TableRow>
            )}
            {templates.map((t) => {
              const c = counts[t.id];
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-slate-600">{t.version ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
                      <span className="truncate max-w-[260px]" title={t.source_file_name ?? ""}>
                        {t.source_file_name ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c?.total ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c?.articles ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c?.formulas ?? "—"}</TableCell>
                  <TableCell>
                    {t.active
                      ? <Badge>Actief</Badge>
                      : <Badge variant="secondary">Inactief</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(t.created_at).toLocaleDateString("nl-NL")}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setPreviewId(t.id)} title="Bekijken">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => toggleActive.mutate(t)} title="Activeren/deactiveren">
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm(`Template "${t.name}" verwijderen?`)) remove.mutate(t.id);
                      }} title="Verwijderen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {importOpen && (
        <ImportTemplateDialog
          onClose={() => setImportOpen(false)}
          onImported={(id) => {
            setImportOpen(false);
            setPreviewId(id);
            qc.invalidateQueries({ queryKey: ["material_templates"] });
          }}
        />
      )}

      {previewId && (
        <TemplatePreviewDialog templateId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </div>
  );
}

function ImportTemplateDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (templateId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [parsed, setParsed] = useState<TemplateParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(f: File) {
    setFile(f);
    setError(null);
    setParsed(null);
    if (!name) {
      const guess = f.name.replace(/\.(xlsm|xlsx|xls)$/i, "");
      setName(guess);
    }
    try {
      const result = await parseTemplateFile(f);
      setParsed(result);
    } catch (e: any) {
      setError(e.message ?? "Parsen mislukt");
    }
  }

  async function onConfirm() {
    if (!parsed || !file) return;
    if (!name.trim()) {
      setError("Naam is verplicht.");
      return;
    }
    if (parsed.counts.article_lines === 0) {
      setError("Geen artikelregels in het bestand — import geblokkeerd.");
      return;
    }
    setBusy(true);
    try {
      const payload = parsed.lines.map((l) => ({
        excel_row_number: l.excel_row_number,
        article_number: l.article_number,
        description: l.description,
        sort_order: l.sort_order,
        default_quantity: l.default_quantity,
        unit: l.unit,
        default_used_quantity: l.default_used_quantity,
        default_return_quantity: l.default_return_quantity,
        default_total_quantity: l.default_total_quantity,
        note: l.note,
        excel_category_id: l.excel_category_id,
        is_section_header: l.is_section_header,
        is_blank_or_separator: l.is_blank_or_separator,
        is_formula_quantity: l.is_formula_quantity,
        quantity_formula_text: l.quantity_formula_text,
        total_formula_text: l.total_formula_text,
        formula_references: l.formula_references,
        source_type: l.source_type,
      }));

      const { data, error: rpcErr } = await supabase.rpc(
        "process_material_template_import",
        {
          p_name: name.trim(),
          p_version: (version.trim() || null) as any,
          p_source_file_name: file.name,
          p_source_sheet_name: parsed.sheet_name,
          p_lines: payload as any,
          p_notes: null as any,
        },
      );
      if (rpcErr) throw rpcErr;
      const res = data as any;
      if (!res?.success) {
        throw new Error(`Import geblokkeerd: ${res?.error ?? "onbekende fout"}`);
      }
      const unmapped = Number(res.unmapped_category_count ?? 0);
      toast.success(
        `Template geïmporteerd: ${res.total_lines} regels · ${res.article_lines_count} artikelen · ${res.section_headers_count ?? 0} headers · ${res.formula_lines_count} formules · ${res.warning_count ?? 0} waarschuwingen · ${unmapped} niet-gematchte categorieën`,
      );
      if (unmapped > 0) {
        toast.warning(
          `Let op: ${unmapped} template-regels konden niet aan een categorie worden gekoppeld. Controleer de categorie-mapping (categories.excel_template_id).`,
          { duration: 8000 },
        );
      }
      onImported(res.template_id as string);
    } catch (e: any) {
      setError(e.message ?? "Import mislukt");
      toast.error(e.message ?? "Import mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Materiaalstaat-template importeren</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Het tabblad <strong>Materiaalstaat</strong> wordt gezocht. Als de tabel <strong>Tabel1</strong> aanwezig is wordt die gebruikt, anders het bereik <strong>A9:K338</strong>. Formules worden als tekst opgeslagen, maar nog niet uitgevoerd.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Naam</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Van den Heuvel Materiaalstaat" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Versie</span>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="9.6.0" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Bestand (.xlsm / .xlsx / .xls)</span>
            <Input
              type="file"
              accept=".xlsm,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>

          {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          {parsed && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Stat label="Tabblad" value={parsed.sheet_name} />
                <Stat label="Bereik" value={parsed.range} />
                <Stat label="Tabel" value={parsed.table_name ?? "—"} />
                <Stat label="Totaal rijen" value={String(parsed.total_rows)} />
                <Stat label="Artikelregels" value={String(parsed.counts.article_lines)} />
                <Stat label="Sectieheaders" value={String(parsed.counts.section_headers)} />
                <Stat label="Formules" value={String(parsed.counts.formula_lines)} />
                <Stat label="Zonder categorie" value={String(parsed.counts.without_category)} warn={parsed.counts.without_category > 0} />
              </div>
              {parsed.warnings.length > 0 && (
                <ul className="list-inside list-disc rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                  {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rij</TableHead>
                      <TableHead>Artikel</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Aantal</TableHead>
                      <TableHead>EH</TableHead>
                      <TableHead>Cat</TableHead>
                      <TableHead>Bron</TableHead>
                      <TableHead>Formule</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.lines.slice(0, 60).map((l) => (
                      <TableRow key={l.excel_row_number}>
                        <TableCell className="text-xs text-slate-500">{l.excel_row_number}</TableCell>
                        <TableCell className="font-mono text-xs">{l.article_number ?? (l.is_section_header ? "—" : "")}</TableCell>
                        <TableCell className="text-xs">{l.description ?? ""}</TableCell>
                        <TableCell className="text-right text-xs">{l.default_quantity ?? ""}</TableCell>
                        <TableCell className="text-xs">{l.unit ?? ""}</TableCell>
                        <TableCell className="text-xs">{l.excel_category_id ?? ""}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary">{l.source_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{l.is_formula_quantity ? "ja" : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.lines.length > 60 && (
                  <div className="p-2 text-center text-xs text-slate-500">
                    +{parsed.lines.length - 60} meer rijen…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuleren</Button>
          <Button onClick={onConfirm} disabled={!parsed || busy}>
            {busy ? "Bezig…" : "Importeren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePreviewDialog({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const { data: template } = useQuery({
    queryKey: ["material_template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_templates").select("*").eq("id", templateId).single();
      if (error) throw error;
      return data as Template;
    },
  });
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["material_template_lines", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_template_lines")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true })
        .order("excel_row_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l: any) =>
      (l.article_number ?? "").toLowerCase().includes(q) ||
      (l.description ?? "").toLowerCase().includes(q));
  }, [lines, filter]);

  const unmappedCount = useMemo(
    () => lines.filter((l: any) =>
      l.category_id == null
      && l.excel_category_id != null
      && !l.is_section_header
      && !l.is_blank_or_separator
    ).length,
    [lines],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{template?.name ?? "Template"}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Versie {template?.version ?? "—"} · Bestand {template?.source_file_name ?? "—"} · Sheet {template?.source_sheet_name ?? "—"}
          </div>
          <Input
            placeholder="Filter op artikel/omschrijving"
            className="w-64"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {unmappedCount > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            {unmappedCount} regels hebben geen categorie-match. Mogelijke oorzaak: Excel category ID ontbreekt of bestaat niet in <code>categories.excel_template_id</code>.
          </div>
        )}
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rij</TableHead>
                <TableHead>Artikel</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="text-right">Aantal</TableHead>
                <TableHead>EH</TableHead>
                <TableHead>Cat</TableHead>
                <TableHead>Bron</TableHead>
                <TableHead>Formule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-sm text-slate-500">Laden…</TableCell></TableRow>
              )}
              {filtered.map((l: any) => (
                <TableRow key={l.id} className={l.is_section_header ? "bg-slate-50" : undefined}>
                  <TableCell className="text-xs text-slate-500">{l.excel_row_number}</TableCell>
                  <TableCell className="font-mono text-xs">{l.article_number ?? (l.is_section_header ? "—" : "")}</TableCell>
                  <TableCell className="text-xs">{l.description ?? ""}</TableCell>
                  <TableCell className="text-right text-xs">{l.default_quantity ?? ""}</TableCell>
                  <TableCell className="text-xs">{l.unit ?? ""}</TableCell>
                  <TableCell className="text-xs">
                    {l.excel_category_id ?? ""}
                    {l.category_id == null && l.excel_category_id != null && !l.is_section_header && !l.is_blank_or_separator && (
                      <Badge variant="outline" className="ml-1 border-amber-400 text-amber-700">Cat niet gematcht</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="secondary">{l.source_type ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs" title={l.quantity_formula_text ?? l.total_formula_text ?? ""}>
                    {(l.is_formula_quantity || l.total_formula_text) ? "ja" : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Link to="/" className="text-xs text-slate-500">Sluiten</Link>
          <Button variant="outline" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${warn ? "border-amber-300 bg-amber-50" : "bg-slate-50"}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
