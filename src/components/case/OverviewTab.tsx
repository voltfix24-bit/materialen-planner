import { Card } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function OverviewTab({ caseRow }: { caseRow: any }) {
  const qc = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: ["case-counts", caseRow.id],
    queryFn: async () => {
      const [{ count: lines }, { count: vol }, { count: aanv }] = await Promise.all([
        supabase
          .from("case_material_lines")
          .select("*", { count: "exact", head: true })
          .eq("case_id", caseRow.id),
        supabase
          .from("verkooporder_lines")
          .select("*", { count: "exact", head: true })
          .eq("case_id", caseRow.id),
        supabase
          .from("case_order_lines")
          .select("*", { count: "exact", head: true })
          .eq("case_id", caseRow.id),
      ]);
      return { lines: lines ?? 0, vol: vol ?? 0, aanv: aanv ?? 0 };
    },
  });

  const fields: Array<[string, string | null]> = [
    ["Casenummer", caseRow.case_number],
    ["Projectnummer", caseRow.project_number],
    ["Omschrijving", caseRow.description],
    ["Datum", caseRow.case_date],
    ["Versie / template", caseRow.template_version],
    ["ASP / SAP-code", caseRow.asp_sap_code],
    ["Afleveradres", caseRow.delivery_address],
    ["Contactpersoon", caseRow.contact_person],
  ];

  const [so, setSo] = useState({
    so_number: caseRow.so_number ?? caseRow.case_number ?? "",
    so_customernumber: caseRow.so_customernumber ?? "",
    so_project: caseRow.so_project ?? caseRow.project_number ?? "",
  });

  useEffect(() => {
    setSo({
      so_number: caseRow.so_number ?? caseRow.case_number ?? "",
      so_customernumber: caseRow.so_customernumber ?? "",
      so_project: caseRow.so_project ?? caseRow.project_number ?? "",
    });
  }, [caseRow.id, caseRow.so_number, caseRow.so_customernumber, caseRow.so_project]);

  const saveSo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("cases")
        .update(so)
        .eq("id", caseRow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseRow.id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Verkooporder instellingen opgeslagen");
    },
    onError: (e: any) => toast.error("Opslaan mislukt: " + e.message),
  });

  const stale = caseRow.export_stale === true;
  const exported = !!caseRow.last_exported_at;

  return (
    <div className="space-y-4">
      {exported && (
        <Card
          className={
            "flex items-start gap-2 p-3 text-sm " +
            (stale
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800")
          }
        >
          {stale ? (
            <AlertTriangle className="mt-0.5 h-4 w-4" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
          )}
          <div>
            <div className="font-medium">
              {stale ? "Gewijzigd na laatste export" : "Export actueel"}
            </div>
            <div className="text-xs opacity-80">
              Laatste export:{" "}
              {new Date(caseRow.last_exported_at).toLocaleString("nl-NL")}
              {caseRow.last_material_change_at && (
                <>
                  {" · "}laatste materiaalwijziging:{" "}
                  {new Date(caseRow.last_material_change_at).toLocaleString(
                    "nl-NL",
                  )}
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">
            Projectgegevens
          </h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {fields.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {caseRow.internal_note && (
            <div className="mt-6">
              <div className="text-xs text-slate-500">Opmerking intern</div>
              <div className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">
                {caseRow.internal_note}
              </div>
            </div>
          )}
        </Card>
        <Card className="space-y-4 p-6">
          <h3 className="text-sm font-semibold text-slate-700">Tellingen</h3>
          <Stat label="Materiaalregels" value={counts?.lines ?? "…"} />
          <Stat label="Aanvulling-regels" value={counts?.aanv ?? "…"} />
          <Stat label="Verkooporder-regels" value={counts?.vol ?? "…"} />
        </Card>
      </div>

      <Card className="p-6">
        <div className="mb-1 text-sm font-semibold text-slate-700">
          Verkooporder instellingen
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Deze velden worden gebruikt voor elke regel in de Verkooporder-CSV. Ze
          moeten allemaal ingevuld zijn voordat je kunt exporteren.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <Field label="so_number">
            <Input
              value={so.so_number}
              onChange={(e) => setSo((s) => ({ ...s, so_number: e.target.value }))}
              placeholder="bv. casenummer"
            />
          </Field>
          <Field label="so_customernumber">
            <Input
              value={so.so_customernumber}
              onChange={(e) =>
                setSo((s) => ({ ...s, so_customernumber: e.target.value }))
              }
            />
          </Field>
          <Field label="so_project">
            <Input
              value={so.so_project}
              onChange={(e) =>
                setSo((s) => ({ ...s, so_project: e.target.value }))
              }
              placeholder="bv. projectnummer"
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => saveSo.mutate()} disabled={saveSo.isPending}>
            Opslaan
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between border-b pb-3 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
