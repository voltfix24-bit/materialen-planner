import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { LayoutTemplate } from "lucide-react";

type Template = {
  id: string;
  name: string;
  version: string | null;
  active: boolean;
};

export function ApplyTemplateButton({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <LayoutTemplate className="h-4 w-4" /> Template toepassen
      </Button>
      {open && <ApplyTemplateDialog caseId={caseId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ApplyTemplateDialog({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [mode, setMode] = useState<"append_missing" | "replace_template_lines">("append_missing");

  const { data: templates = [] } = useQuery({
    queryKey: ["material_templates_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_templates")
        .select("id,name,version,active")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const { data: existingApplications = [] } = useQuery({
    queryKey: ["case_template_applications", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_template_applications")
        .select("template_id,applied_at,lines_created_count")
        .eq("case_id", caseId)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["material_template_lines_counts", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_template_lines")
        .select("is_section_header,is_formula_quantity,total_formula_text,category_id,is_blank_or_separator")
        .eq("template_id", templateId!);
      if (error) throw error;
      const rows = data ?? [];
      const articles = rows.filter((r: any) => !r.is_section_header && !r.is_blank_or_separator);
      return {
        total: rows.length,
        articles: articles.length,
        headers: rows.filter((r: any) => r.is_section_header).length,
        formulas: rows.filter((r: any) => r.is_formula_quantity || r.total_formula_text).length,
        without_category: articles.filter((r: any) => !r.category_id).length,
      };
    },
  });

  const alreadyApplied = useMemo(
    () => existingApplications.find((a: any) => a.template_id === templateId),
    [existingApplications, templateId],
  );

  const apply = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error("Geen template geselecteerd");
      const { data, error } = await supabase.rpc("apply_material_template_to_case", {
        p_case_id: caseId,
        p_template_id: templateId,
        p_mode: mode,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res) => {
      toast.success(
        `Template toegepast: ${res?.lines_created_count ?? 0} nieuw, ` +
          `${res?.skipped_existing_count ?? 0} bestaand, ` +
          `${res?.skipped_headers_count ?? 0} headers overgeslagen, ` +
          `${res?.formula_lines_count ?? 0} formule-placeholders`,
      );
      qc.invalidateQueries({ queryKey: ["case_material_lines", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case_template_applications", caseId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Toepassen mislukt"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Materiaalstaat-template toepassen</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Geen actieve templates beschikbaar. Importeer eerst een template via{" "}
              <Link to="/templates" className="underline">Materiaalstaat templates</Link>.
            </div>
          ) : (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Template</span>
                <Select value={templateId ?? undefined} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Kies een template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.version ? ` — ${t.version}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {templateId && counts && (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Stat label="Totaal" value={String(counts.total)} />
                  <Stat label="Artikelen" value={String(counts.articles)} />
                  <Stat label="Headers" value={String(counts.headers)} />
                  <Stat label="Formules" value={String(counts.formulas)} />
                </div>
              )}

              {alreadyApplied && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                  <div>
                    Deze case heeft deze template al eerder toegepast op{" "}
                    {new Date(alreadyApplied.applied_at).toLocaleString("nl-NL")} ({alreadyApplied.lines_created_count} regels).
                  </div>
                  <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="append">Alleen ontbrekende regels toevoegen (append)</SelectItem>
                      <SelectItem value="replace_template_lines">
                        Bestaande template-regels verwijderen en opnieuw toepassen
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-[11px] text-amber-800">
                    Handmatig toegevoegde regels blijven altijd staan.
                  </div>
                </div>
              )}

              <div className="rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
                Sectieheaders worden niet als materiaalregels toegevoegd. Formuleregels krijgen status{" "}
                <Badge variant="secondary">stored_not_active</Badge> — formules worden in deze fase nog niet uitgevoerd.
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={apply.isPending}>Annuleren</Button>
          <Button onClick={() => apply.mutate()} disabled={!templateId || apply.isPending}>
            {apply.isPending ? "Bezig…" : "Toepassen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
