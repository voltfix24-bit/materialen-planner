import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { STATUS, STATUS_OPTIONS, type CaseStatus } from "@/lib/case-status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { OverviewTab } from "@/components/case/OverviewTab";
import { MaterialEditor } from "@/components/case/MaterialEditor";
import { VerbruikTab } from "@/components/case/VerbruikTab";
import { AanvullingTab } from "@/components/case/AanvullingTab";
import { VerkoopOrderTab } from "@/components/case/VerkoopOrderTab";
import { ExportLogTab } from "@/components/case/ExportLogTab";
import { CaseControlPanel } from "@/components/case/CaseControlPanel";

export const Route = createFileRoute("/cases/$caseId")({ component: CaseDetail });

function CaseDetail() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const { data: caseRow, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: CaseStatus) => {
      const { error } = await supabase
        .from("cases")
        .update({ status })
        .eq("id", caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Status bijgewerkt");
    },
  });

  const settingsMissing =
    !caseRow?.so_number ||
    !caseRow?.so_customernumber ||
    !caseRow?.so_project;

  const exportCsv = async () => {
    if (settingsMissing) {
      toast.error(
        "Vul eerst so_number, so_customernumber en so_project in op het tabblad Overzicht.",
      );
      setTab("overview");
      return;
    }
    toast.loading("CSV genereren…", { id: "export" });
    try {
      const { data, error } = await supabase.functions.invoke(
        "export-verkooporder-csv",
        { body: { case_id: caseId } },
      );
      // Edge function returns 400 with a JSON body; supabase-js sets `error`
      // but the parsed body still arrives in `data`. Prefer the server message.
      if (data?.error) {
        toast.error(data.error, { id: "export" });
        return;
      }
      if (error) throw error;
      const csv = data.csv;
      const fileName = data.file_name ?? `Case ${caseId}.csv`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV gedownload (${data.row_count} regels)`, { id: "export" });
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["export-logs", caseId] });
      qc.invalidateQueries({ queryKey: ["verkooporder", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    } catch (e: any) {
      toast.error("Export mislukt: " + (e?.message ?? "onbekende fout"), {
        id: "export",
      });
    }
  };

  if (isLoading || !caseRow)
    return <div className="text-sm text-slate-500">Laden…</div>;

  const s = STATUS[(caseRow.status as CaseStatus) ?? "concept"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
      </div>

      <div className="sticky top-14 z-30 -mx-6 border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-[1400px] items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">
                Case {caseRow.case_number || "—"}
              </h1>
              <Badge className={s.className} variant="secondary">
                {s.label}
              </Badge>
              {caseRow.export_stale && (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-amber-800"
                >
                  Gewijzigd na export
                </Badge>
              )}
              {!caseRow.export_stale && caseRow.last_exported_at && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-100 text-emerald-800"
                >
                  Export actueel
                </Badge>
              )}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {caseRow.project_number ? `Project ${caseRow.project_number} · ` : ""}
              {caseRow.description || "Geen omschrijving"}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Laatst gewijzigd:{" "}
              {new Date(caseRow.updated_at).toLocaleString("nl-NL")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={caseRow.status}
              onValueChange={(v) => updateStatus.mutate(v as CaseStatus)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={exportCsv}
              disabled={settingsMissing}
              title={
                settingsMissing
                  ? "Vul eerst so_number, so_customernumber en so_project in op het tabblad Overzicht"
                  : undefined
              }
            >
              <Download className="h-4 w-4" /> CSV exporteren
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overzicht</TabsTrigger>
          <TabsTrigger value="material">Materiaalstaat</TabsTrigger>
          <TabsTrigger value="verbruik">Verbruik</TabsTrigger>
          <TabsTrigger value="aanvulling">Aanvulling</TabsTrigger>
          <TabsTrigger value="verkoop">Verkooporder</TabsTrigger>
          <TabsTrigger value="logs">Exportlog</TabsTrigger>
          <TabsTrigger value="control">Controle</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab caseRow={caseRow} />
        </TabsContent>
        <TabsContent value="material" className="mt-4">
          <MaterialEditor caseId={caseId} />
        </TabsContent>
        <TabsContent value="verbruik" className="mt-4">
          <VerbruikTab caseId={caseId} caseRow={caseRow} />
        </TabsContent>
        <TabsContent value="aanvulling" className="mt-4">
          <AanvullingTab caseId={caseId} caseRow={caseRow} />
        </TabsContent>
        <TabsContent value="verkoop" className="mt-4">
          <VerkoopOrderTab caseId={caseId} caseRow={caseRow} />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <ExportLogTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="control" className="mt-4">
          <CaseControlPanel caseId={caseId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
