import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle, Download, Info } from "lucide-react";
import { toast } from "sonner";

// CSV-formaat (spiegel van edge function CSV_CONFIG)
const CSV_PREVIEW_CONFIG = {
  separator: ",",
  include_header: true,
  encoding: "utf-8",
  decimal: ".",
};

const CSV_HEADERS = [
  "sol_articlenumber",
  "sol_quantity",
  "so_number",
  "so_customernumber",
  "so_project",
];

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  const sep = CSV_PREVIEW_CONFIG.separator;
  return s.includes(sep) || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function previewLines(rows: any[]): string[] {
  const out: string[] = [];
  if (CSV_PREVIEW_CONFIG.include_header)
    out.push(CSV_HEADERS.join(CSV_PREVIEW_CONFIG.separator));
  for (const r of rows.slice(0, 10)) {
    out.push(
      [
        csvEscape(r.sol_articlenumber),
        String(Number(r.sol_quantity)),
        csvEscape(r.so_number),
        csvEscape(r.so_customernumber),
        csvEscape(r.so_project),
      ].join(CSV_PREVIEW_CONFIG.separator),
    );
  }
  return out;
}

export function VerkoopOrderTab({
  caseId,
  caseRow,
}: {
  caseId: string;
  caseRow: any;
}) {
  const qc = useQueryClient();

  const rowsQuery = useQuery({
    queryKey: ["verkooporder-rpc", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_case_verkooporder_lines" as any,
        { p_case_id: caseId },
      );
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const rows = rowsQuery.data ?? [];

  const { data: aanvullingCount = 0 } = useQuery({
    queryKey: ["aanvulling-count", caseId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("case_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: lastExport } = useQuery({
    queryKey: ["last-export", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("export_logs")
        .select("status, exported_at, error_message, row_count")
        .eq("case_id", caseId)
        .eq("export_type", "verkooporder_csv")
        .order("exported_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const settingsMissing =
    !caseRow.so_number || !caseRow.so_customernumber || !caseRow.so_project;
  const missingFields = [
    !caseRow.so_number && "so_number",
    !caseRow.so_customernumber && "so_customernumber",
    !caseRow.so_project && "so_project",
  ].filter(Boolean) as string[];

  const lastAanvulling = caseRow.last_aanvulling_rebuild_at as string | null;
  const lastVerkooporder = caseRow.last_verkooporder_rebuild_at as string | null;
  const lastMaterial = caseRow.last_material_change_at as string | null;

  const aanvullingStale =
    !!lastAanvulling &&
    !!lastMaterial &&
    new Date(lastMaterial) > new Date(lastAanvulling);
  const aanvullingMissing = aanvullingCount === 0 || !lastAanvulling;
  const verkooporderActueel =
    !!lastVerkooporder &&
    !!lastAanvulling &&
    new Date(lastVerkooporder) >= new Date(lastAanvulling) &&
    !aanvullingStale;
  const verkooporderStale =
    !!lastVerkooporder &&
    !!lastAanvulling &&
    new Date(lastVerkooporder) < new Date(lastAanvulling);
  const verkooporderNeverBuilt = !lastVerkooporder;

  const rebuild = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "rebuild_verkooporder_lines" as any,
        { p_case_id: caseId },
      );
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["verkooporder-rpc", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      if (!result?.success) {
        toast.error(result?.message ?? `Rebuild mislukt: ${result?.error}`);
        return;
      }
      toast.success(
        `Verkooporder opnieuw opgebouwd: ${result.lines_created_count} regel(s) · totaal ${result.total_quantity}`,
      );
    },
    onError: (e: any) => toast.error("Rebuild mislukt: " + (e?.message ?? e)),
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "export-verkooporder-csv",
        { body: { case_id: caseId } },
      );
      if ((data as any)?.error) throw new Error((data as any).error);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data: any) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.file_name ?? `Case ${caseId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV gedownload (${data.row_count} regels)`);
      qc.invalidateQueries({ queryKey: ["verkooporder-rpc", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["last-export", caseId] });
      qc.invalidateQueries({ queryKey: ["export-logs", caseId] });
    },
    onError: (e: any) => toast.error("Export mislukt: " + (e?.message ?? e)),
  });

  const totalQty = useMemo(
    () => rows.reduce((s: number, r: any) => s + (Number(r.sol_quantity) || 0), 0),
    [rows],
  );

  const preview = useMemo(() => previewLines(rows), [rows]);

  const fmt = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString("nl-NL") : "—";

  // Status badge
  let statusLabel = "Verkooporder nog niet opgebouwd";
  let statusClass = "bg-slate-100 text-slate-700";
  if (verkooporderActueel) {
    statusLabel = "Verkooporder actueel";
    statusClass = "bg-emerald-100 text-emerald-800";
  } else if (verkooporderStale) {
    statusLabel = "Verkooporder mogelijk verouderd";
    statusClass = "bg-amber-100 text-amber-800";
  } else if (aanvullingMissing) {
    statusLabel = "Aanvulling eerst opbouwen";
    statusClass = "bg-amber-100 text-amber-800";
  }

  const canRebuild = !settingsMissing && !aanvullingMissing && !aanvullingStale;
  const canExport =
    !settingsMissing && !aanvullingMissing && !aanvullingStale && rows.length > 0;

  return (
    <div className="space-y-4">
      {/* Waarschuwingen */}
      {settingsMissing && (
        <Card className="flex items-start gap-2 border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <strong>Vul eerst {missingFields.join(", ")} in</strong> op het tabblad
            Overzicht. Zonder deze instellingen kan de Verkooporder niet worden
            opgebouwd of geëxporteerd.
          </div>
        </Card>
      )}
      {!settingsMissing && aanvullingMissing && (
        <Card className="flex items-start gap-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            Bouw eerst Aanvulling op voordat je Verkooporder maakt. Verkooporder
            wordt opgebouwd uit de laatst gebouwde Aanvulling.
          </div>
        </Card>
      )}
      {!settingsMissing && !aanvullingMissing && aanvullingStale && (
        <Card className="flex items-start gap-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            Aanvulling is mogelijk verouderd — Materiaalstaat is gewijzigd na de
            laatste Aanvulling-rebuild. Bouw eerst Aanvulling opnieuw op.
          </div>
        </Card>
      )}
      {!settingsMissing && !aanvullingMissing && verkooporderStale && (
        <Card className="flex items-start gap-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            Verkooporder is mogelijk verouderd — Aanvulling is opnieuw gebouwd na
            de laatste Verkooporder-rebuild. Bouw Verkooporder opnieuw op of
            exporteer (export rebuildt automatisch).
          </div>
        </Card>
      )}

      {/* Statistieken */}
      <Card className="grid grid-cols-2 gap-4 p-4 text-sm md:grid-cols-4 lg:grid-cols-7">
        <Stat label="Verkooporderregels" value={rows.length} />
        <Stat label="Totale hoeveelheid" value={totalQty} />
        <Stat label="Aanvullingsregels (bron)" value={aanvullingCount} />
        <Stat label="Laatste Aanvulling rebuild" value={fmt(lastAanvulling)} />
        <Stat label="Laatste Verkooporder rebuild" value={fmt(lastVerkooporder)} />
        <Stat label="Laatste CSV-export" value={fmt(lastExport?.exported_at)} />
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Status
          </div>
          <div className="mt-1">
            <Badge variant="secondary" className={statusClass}>
              {statusLabel}
            </Badge>
          </div>
          {settingsMissing && (
            <div className="mt-1 text-xs text-red-700">
              Instellingen ontbreken
            </div>
          )}
        </div>
      </Card>

      {/* Acties */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          <Info className="mr-1 inline h-3 w-3" /> Bron: laatst opgebouwde
          Aanvulling. CSV-export rebuildt altijd zelf vanuit de actuele
          Aanvulling.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => rowsQuery.refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => rebuild.mutate()}
            disabled={!canRebuild || rebuild.isPending}
            title={
              !canRebuild
                ? "Vereisten ontbreken (instellingen of Aanvulling)"
                : undefined
            }
          >
            <RefreshCw
              className={`h-4 w-4 ${rebuild.isPending ? "animate-spin" : ""}`}
            />{" "}
            Verkooporder opnieuw opbouwen
          </Button>
          <Button
            onClick={() => exportCsv.mutate()}
            disabled={!canExport || exportCsv.isPending}
            title={!canExport ? "Vereisten ontbreken" : undefined}
          >
            <Download className="h-4 w-4" /> CSV exporteren
          </Button>
        </div>
      </div>

      {/* Verkooporder tabel */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>
            {rows.length} regel(s) · Totaal sol_quantity:{" "}
            <span className="font-medium tabular-nums">{totalQty}</span>
          </span>
          <span className="text-slate-400">
            Case {caseRow?.case_number ?? "—"}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">sol_articlenumber</th>
              <th className="px-4 py-2 text-right">sol_quantity</th>
              <th className="px-4 py-2">so_number</th>
              <th className="px-4 py-2">so_customernumber</th>
              <th className="px-4 py-2">so_project</th>
              <th className="px-4 py-2 text-right">bronregels</th>
              <th className="px-4 py-2">bijgewerkt</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Geen verkooporderregels — klik op "Verkooporder opnieuw
                  opbouwen" of exporteer direct.
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.verkooporder_line_id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">
                  {r.sol_articlenumber}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {Number(r.sol_quantity)}
                </td>
                <td className="px-4 py-2">{r.so_number}</td>
                <td className="px-4 py-2">{r.so_customernumber}</td>
                <td className="px-4 py-2">{r.so_project}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {r.source_case_order_line_count}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {fmt(r.updated_at)}
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t bg-slate-50 font-medium">
                <td className="px-4 py-2 text-right">Totaal</td>
                <td className="px-4 py-2 text-right tabular-nums">{totalQty}</td>
                <td colSpan={5}></td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* CSV preview */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">CSV-preview (eerste 10 regels)</div>
          <div className="text-xs text-slate-500">
            Bestand:{" "}
            <span className="font-mono">
              Case {caseRow?.case_number ?? caseId}.csv
            </span>{" "}
            · separator{" "}
            <span className="font-mono">"{CSV_PREVIEW_CONFIG.separator}"</span> ·
            decimal{" "}
            <span className="font-mono">"{CSV_PREVIEW_CONFIG.decimal}"</span> ·{" "}
            {CSV_PREVIEW_CONFIG.encoding} · header{" "}
            {CSV_PREVIEW_CONFIG.include_header ? "ja" : "nee"}
          </div>
        </div>
        <pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
          {preview.length === 0
            ? "(leeg — geen regels om te exporteren)"
            : preview.join("\n")}
        </pre>
      </Card>

      {lastExport?.status === "failed" && (
        <Card className="border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          Laatste export-poging mislukt op{" "}
          {fmt(lastExport.exported_at as any)}: {lastExport.error_message}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
