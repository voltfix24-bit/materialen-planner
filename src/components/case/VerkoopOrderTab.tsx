import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  RefreshCw,
  AlertTriangle,
  Download,
  Info,
  Copy,
  Upload,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CSV_CONFIG,
  CSV_CONFIG_VERSION,
  CSV_HEADERS,
  buildCsv,
  fileName,
  parseCsv,
  detectLineEnding,
  detectSeparator,
} from "@/lib/csv-config";

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

  const readinessQuery = useQuery({
    queryKey: ["case-export-readiness", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_case_export_readiness" as any,
        { p_case_id: caseId },
      );
      if (error) throw error;
      return data as any;
    },
  });
  const readiness = readinessQuery.data;
  const readyForExport: boolean = !!readiness?.ready;
  const readinessBlocking: Array<{ code: string; message: string }> =
    readiness?.blocking_items ?? [];
  const readinessWarnings: Array<{ code: string; message: string }> =
    readiness?.warning_items ?? [];

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
        .select("status, exported_at, error_message, row_count, file_name")
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
      qc.invalidateQueries({ queryKey: ["case-export-readiness", caseId] });
      if (!result?.success) {
        const blocking = (result?.blocking_items ?? []) as Array<{ message: string }>;
        const msg =
          blocking.length > 0
            ? blocking.map((b) => `• ${b.message}`).join("\n")
            : (result?.message ?? `Rebuild mislukt: ${result?.error_code ?? result?.error}`);
        toast.error(msg);
        return;
      }
      toast.success(
        `Verkooporder opnieuw opgebouwd: ${result.lines_created_count} regel(s) · totaal ${result.total_quantity}`,
      );
    },
    onError: (e: any) => toast.error("Rebuild mislukt: " + (e?.message ?? e)),
  });

  const [lastExportMeta, setLastExportMeta] = useState<{
    csv_config_version?: string;
    csv_header?: string;
    csv_config?: any;
    file_name?: string;
    row_count?: number;
  } | null>(null);

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
      a.download = data.file_name ?? fileName(caseRow?.case_number);
      a.click();
      URL.revokeObjectURL(url);
      setLastExportMeta({
        csv_config_version: data.csv_config_version,
        csv_header: data.csv_header,
        csv_config: data.csv_config,
        file_name: data.file_name,
        row_count: data.row_count,
      });
      if (
        data.csv_config_version &&
        data.csv_config_version !== CSV_CONFIG_VERSION
      ) {
        toast.warning(
          `CSV-config versie verschilt: preview ${CSV_CONFIG_VERSION} vs export ${data.csv_config_version}`,
        );
      }
      toast.success(`CSV gedownload (${data.row_count} regels)`);
      qc.invalidateQueries({ queryKey: ["verkooporder-rpc", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["last-export", caseId] });
    },
    onError: (e: any) => toast.error("Export mislukt: " + (e?.message ?? e)),
  });

  const totalQty = useMemo(
    () => rows.reduce((s: number, r: any) => s + (Number(r.sol_quantity) || 0), 0),
    [rows],
  );

  // === Volledige CSV mirror van edge function (preview + diagnostiek + vergelijking) ===
  const appCsv = useMemo(() => buildCsv(rows), [rows]);
  const appFileName = fileName(caseRow?.case_number ?? caseId);
  const previewLines = useMemo(() => {
    // splits op de geconfigureerde line ending; toon eerste 11 regels (header + 10 data)
    const lines = appCsv.split(CSV_CONFIG.line_ending).filter((l) => l !== "");
    return lines.slice(0, 11);
  }, [appCsv]);

  // === Diagnostiek ===
  const diagnostics = useMemo(() => {
    const articleNumbers: string[] = rows.map((r: any) =>
      String(r.sol_articlenumber ?? "").trim(),
    );
    const emptyArt = articleNumbers.filter((a) => a === "").length;
    const nonPositive = rows.filter(
      (r: any) => !(Number(r.sol_quantity) > 0),
    ).length;
    const counts = new Map<string, number>();
    for (const a of articleNumbers)
      counts.set(a, (counts.get(a) ?? 0) + 1);
    const duplicates = [...counts.values()].some((v) => v > 1);
    const unique = counts.size;
    const totalSum = rows.reduce(
      (s: number, r: any) => s + (Number(r.sol_quantity) || 0),
      0,
    );
    const longest = articleNumbers.reduce(
      (m, a) => (a.length > m ? a.length : m),
      0,
    );
    const leadingZero = articleNumbers.some(
      (a) => a.length > 1 && a.startsWith("0"),
    );
    const scientific = articleNumbers.some((a) => /^\d+(\.\d+)?[eE][+-]?\d+$/.test(a));
    return {
      orderRowCount: rows.length,
      csvRowCount: Math.max(
        0,
        appCsv.split(CSV_CONFIG.line_ending).filter((l) => l !== "").length -
          (CSV_CONFIG.include_header ? 1 : 0),
      ),
      emptyArt,
      nonPositive,
      unique,
      duplicates,
      totalSum,
      longest,
      leadingZero,
      scientific,
    };
  }, [rows, appCsv]);

  // === Excel reference comparison ===
  const [refText, setRefText] = useState("");
  const [refFileName, setRefFileName] = useState<string | null>(null);

  const comparison = useMemo(() => {
    if (!refText.trim()) return null;
    const refSep = detectSeparator(refText);
    const refLE = detectLineEnding(refText);
    const parsed = parseCsv(refText, refSep);
    const refHeaders = parsed.headers;
    const refRows = parsed.rows;

    const headerMatch =
      refHeaders.length === CSV_HEADERS.length &&
      refHeaders.every(
        (h, i) => h.toLowerCase() === CSV_HEADERS[i].toLowerCase(),
      );
    const colCountMatch = refHeaders.length === CSV_HEADERS.length;

    // Aggregeer per artikelnummer (excel)
    const idxArt = refHeaders.findIndex(
      (h) => h.toLowerCase() === "sol_articlenumber",
    );
    const idxQty = refHeaders.findIndex(
      (h) => h.toLowerCase() === "sol_quantity",
    );

    const excelAgg = new Map<string, number>();
    const excelOrder: string[] = [];
    for (const r of refRows) {
      const art =
        idxArt >= 0 ? String(r[idxArt] ?? "").trim() : String(r[0] ?? "").trim();
      const qtyRaw =
        idxQty >= 0 ? String(r[idxQty] ?? "") : String(r[1] ?? "");
      const qty = Number(qtyRaw.replace(",", "."));
      if (!art) continue;
      if (!excelAgg.has(art)) excelOrder.push(art);
      excelAgg.set(art, (excelAgg.get(art) ?? 0) + (Number.isFinite(qty) ? qty : 0));
    }

    const appAgg = new Map<string, number>();
    const appOrder: string[] = [];
    for (const r of rows) {
      const art = String(r.sol_articlenumber ?? "").trim();
      const qty = Number(r.sol_quantity) || 0;
      if (!art) continue;
      if (!appAgg.has(art)) appOrder.push(art);
      appAgg.set(art, (appAgg.get(art) ?? 0) + qty);
    }

    const allArticles = new Set<string>([...appAgg.keys(), ...excelAgg.keys()]);
    const perArticle = [...allArticles].sort().map((art) => {
      const a = appAgg.get(art);
      const e = excelAgg.get(art);
      let status: "equal" | "diff" | "missing_app" | "missing_excel";
      if (a == null) status = "missing_app";
      else if (e == null) status = "missing_excel";
      else if (Math.abs((a ?? 0) - (e ?? 0)) < 1e-9) status = "equal";
      else status = "diff";
      return {
        art,
        app: a,
        excel: e,
        diff: a != null && e != null ? a - e : null,
        status,
      };
    });

    const onlyInApp = perArticle.filter((p) => p.status === "missing_excel");
    const onlyInExcel = perArticle.filter((p) => p.status === "missing_app");
    const qtyDiff = perArticle.filter((p) => p.status === "diff");

    const sameOrder =
      appOrder.length === excelOrder.length &&
      appOrder.every((a, i) => a === excelOrder[i]);

    const appTotal = [...appAgg.values()].reduce((s, v) => s + v, 0);
    const excelTotal = [...excelAgg.values()].reduce((s, v) => s + v, 0);

    return {
      refSep,
      refLE,
      refHeaders,
      refRowCount: refRows.length,
      headerMatch,
      colCountMatch,
      rowCountMatch: refRows.length === rows.length,
      separatorMatch: refSep === CSV_CONFIG.separator,
      sameOrder,
      perArticle,
      onlyInApp,
      onlyInExcel,
      qtyDiff,
      appTotal,
      excelTotal,
      totalDiff: appTotal - excelTotal,
      appOrder,
      excelOrder,
    };
  }, [refText, rows]);

  const fmt = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString("nl-NL") : "—";

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

  // Single source of truth: server-side readiness drives enable/disable + reasons
  const canRebuild = readyForExport && !rebuild.isPending;
  const canExport = readyForExport && rows.length > 0 && !exportCsv.isPending;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} gekopieerd`);
    } catch {
      toast.error("Kopiëren mislukt");
    }
  };

  const onUpload = async (file: File) => {
    const text = await file.text();
    setRefText(text);
    setRefFileName(file.name);
  };

  return (
    <div className="space-y-4">
      {/* Centrale readiness (zelfde bron als Controle-tab) */}
      {readiness && (readinessBlocking.length > 0 || readinessWarnings.length > 0) && (
        <Card
          className={`p-3 text-sm ${
            readinessBlocking.length > 0
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {readinessBlocking.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Export geblokkeerd ({readinessBlocking.length})
              </div>
              <ul className="mt-1 list-disc pl-5">
                {readinessBlocking.map((b, i) => (
                  <li key={i}>
                    <span className="font-mono text-xs opacity-70">[{b.code}]</span>{" "}
                    {b.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {readinessWarnings.length > 0 && (
            <div className={readinessBlocking.length > 0 ? "mt-2" : ""}>
              <div className="text-xs font-semibold uppercase opacity-80">
                Waarschuwingen ({readinessWarnings.length})
              </div>
              <ul className="mt-1 list-disc pl-5">
                {readinessWarnings.map((w, i) => (
                  <li key={i}>
                    <span className="font-mono text-xs opacity-70">[{w.code}]</span>{" "}
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
        </div>
      </Card>

      {/* Acties */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          <Info className="mr-1 inline h-3 w-3" /> Bron: laatst opgebouwde
          Aanvulling. Export rebuildt altijd zelf.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => rowsQuery.refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => rebuild.mutate()}
            disabled={!canRebuild || rebuild.isPending}
          >
            <RefreshCw
              className={`h-4 w-4 ${rebuild.isPending ? "animate-spin" : ""}`}
            />{" "}
            Verkooporder opnieuw opbouwen
          </Button>
          <Button
            onClick={() => exportCsv.mutate()}
            disabled={!canExport || exportCsv.isPending}
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Geen verkooporderregels.
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
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* CSV preview */}
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">
            CSV-preview (header + eerste 10 regels)
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(previewLines.join("\n"), "Preview")}>
              <Copy className="h-3 w-3" /> Kopieer preview
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(appCsv, "Volledige CSV")}>
              <Copy className="h-3 w-3" /> Kopieer volledige CSV
            </Button>
          </div>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
          <Meta k="bestand" v={appFileName} />
          <Meta k="csv_config_version" v={CSV_CONFIG_VERSION} />
          <Meta k="separator" v={JSON.stringify(CSV_CONFIG.separator)} />
          <Meta k="header" v={CSV_CONFIG.include_header ? "ja" : "nee"} />
          <Meta k="encoding" v={CSV_CONFIG.encoding} />
          <Meta k="line ending" v={CSV_CONFIG.line_ending === "\r\n" ? "CRLF (\\r\\n)" : "LF (\\n)"} />
          <Meta k="decimal" v={JSON.stringify(CSV_CONFIG.decimal_separator)} />
          <Meta k="quote_values" v={CSV_CONFIG.quote_values ? "ja" : "nee"} />
          <Meta k="totaal datarijen" v={String(diagnostics.csvRowCount)} />
          <Meta k="gegenereerd" v={new Date().toLocaleString("nl-NL")} />
        </div>
        {lastExportMeta && (
          <div className="mb-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
            <div className="mb-1 font-medium text-slate-700">
              Laatste export (server-respons)
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Meta k="file" v={lastExportMeta.file_name ?? "—"} />
              <Meta k="rows" v={String(lastExportMeta.row_count ?? "—")} />
              <Meta
                k="server csv_config_version"
                v={lastExportMeta.csv_config_version ?? "—"}
              />
              <Meta
                k="server header"
                v={lastExportMeta.csv_header ?? "—"}
              />
            </div>
            {lastExportMeta.csv_config_version &&
              lastExportMeta.csv_config_version !== CSV_CONFIG_VERSION && (
                <div className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3 w-3" />
                  <div>
                    Preview-config versie ({CSV_CONFIG_VERSION}) verschilt van
                    export-config versie ({lastExportMeta.csv_config_version}).
                    Update <code>src/lib/csv-config.ts</code> en de edge
                    function zodat ze weer gelijk lopen.
                  </div>
                </div>
              )}
          </div>
        )}
        <pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
          {previewLines.length === 0
            ? "(leeg — geen regels om te exporteren)"
            : previewLines.join("\n")}
        </pre>
      </Card>

      {/* Diagnostics */}
      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">CSV-controle (diagnostiek)</div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Verkooporderregels" value={diagnostics.orderRowCount} />
          <Stat label="Geëxporteerde CSV-regels" value={diagnostics.csvRowCount} />
          <Stat label="Regels met leeg artikelnr." value={diagnostics.emptyArt} />
          <Stat label="Regels met qty ≤ 0" value={diagnostics.nonPositive} />
          <Stat label="Unieke artikelnummers" value={diagnostics.unique} />
          <Stat label="Dubbele artikelnummers" value={diagnostics.duplicates ? "ja" : "nee"} />
          <Stat label="Som sol_quantity" value={diagnostics.totalSum} />
          <Stat label="Langste artikelnr. (chars)" value={diagnostics.longest} />
          <Stat label="Voorloopnul aanwezig" value={diagnostics.leadingZero ? "ja" : "nee"} />
          <Stat
            label="Wetenschappelijke notatie"
            value={diagnostics.scientific ? "JA — verdacht" : "nee"}
          />
        </div>
      </Card>

      {/* Excel-vergelijking */}
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Vergelijk met Excel CSV</div>
          <div className="flex items-center gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />
              <Button size="sm" variant="outline" asChild>
                <span>
                  <Upload className="h-3 w-3" /> Upload referentie-CSV
                </span>
              </Button>
            </label>
            {refText && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRefText("");
                  setRefFileName(null);
                }}
              >
                <X className="h-3 w-3" /> Wissen
              </Button>
            )}
          </div>
        </div>
        <Textarea
          value={refText}
          onChange={(e) => setRefText(e.target.value)}
          placeholder="…of plak hier de Excel-CSV (eerste regel = header)"
          className="font-mono text-xs"
          rows={6}
        />
        {refFileName && (
          <div className="mt-1 text-xs text-slate-500">
            Geladen: <span className="font-mono">{refFileName}</span>
          </div>
        )}

        {comparison && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <CheckRow ok={comparison.headerMatch} label="Headers gelijk" />
              <CheckRow ok={comparison.colCountMatch} label="Kolomaantal gelijk" />
              <CheckRow ok={comparison.rowCountMatch} label={`Aantal datarijen gelijk (${comparison.refRowCount} vs ${rows.length})`} />
              <CheckRow ok={comparison.separatorMatch} label={`Separator gelijk (excel: ${JSON.stringify(comparison.refSep)})`} />
              <CheckRow ok={comparison.sameOrder} label="Volgorde van regels gelijk" />
              <CheckRow
                ok={Math.abs(comparison.totalDiff) < 1e-9}
                label={`Totaal qty gelijk (app ${comparison.appTotal} / excel ${comparison.excelTotal})`}
              />
              <div className="text-xs text-slate-500">
                Excel line ending: {comparison.refLE === "\r\n" ? "CRLF" : comparison.refLE === "\n" ? "LF" : comparison.refLE === "\r" ? "CR" : "?"}
              </div>
              <div className="text-xs text-slate-500">
                Excel headers: <span className="font-mono">{comparison.refHeaders.join(" | ")}</span>
              </div>
            </div>

            <DiffBlock
              title={`A. Alleen in app-export (${comparison.onlyInExcel.length})`}
              items={comparison.onlyInExcel}
              showExcel={false}
            />
            <DiffBlock
              title={`B. Alleen in Excel-export (${comparison.onlyInApp.length})`}
              items={comparison.onlyInApp}
              showApp={false}
            />
            <DiffBlock
              title={`C. Zelfde artikelnummer, ander aantal (${comparison.qtyDiff.length})`}
              items={comparison.qtyDiff}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <RawCsvBlock title="App CSV" text={appCsv} />
              <RawCsvBlock title="Referentie / Excel CSV" text={refText} />
            </div>
          </div>
        )}
        {!comparison && (
          <p className="mt-3 text-xs text-slate-500">
            Upload of plak een Excel-CSV om automatisch te vergelijken.
          </p>
        )}
      </Card>

      {lastExport?.status === "failed" && (
        <Card className="border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          Laatste export-poging mislukt op {fmt(lastExport.exported_at as any)}:{" "}
          {lastExport.error_message}
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

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-slate-400">{k}:</span>{" "}
      <span className="font-mono">{v}</span>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <X className="h-4 w-4 text-rose-600" />
      )}
      <span className={ok ? "text-emerald-800" : "text-rose-800"}>{label}</span>
    </div>
  );
}

function DiffBlock({
  title,
  items,
  showApp = true,
  showExcel = true,
}: {
  title: string;
  items: Array<{ art: string; app?: number; excel?: number; diff: number | null }>;
  showApp?: boolean;
  showExcel?: boolean;
}) {
  if (items.length === 0)
    return (
      <div className="rounded border bg-emerald-50 p-2 text-xs text-emerald-800">
        ✓ {title} — geen
      </div>
    );
  return (
    <div className="rounded border">
      <div className="border-b bg-slate-50 px-3 py-1.5 text-xs font-medium">
        {title}
      </div>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="px-3 py-1">Artikelnr.</th>
              {showApp && <th className="px-3 py-1 text-right">App</th>}
              {showExcel && <th className="px-3 py-1 text-right">Excel</th>}
              <th className="px-3 py-1 text-right">Verschil</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.art} className="border-t">
                <td className="px-3 py-1 font-mono">{it.art}</td>
                {showApp && (
                  <td className="px-3 py-1 text-right tabular-nums">
                    {it.app ?? "—"}
                  </td>
                )}
                {showExcel && (
                  <td className="px-3 py-1 text-right tabular-nums">
                    {it.excel ?? "—"}
                  </td>
                )}
                <td className="px-3 py-1 text-right tabular-nums">
                  {it.diff ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RawCsvBlock({ title, text }: { title: string; text: string }) {
  const lines = text.split(/\r?\n/).slice(0, 20);
  return (
    <div className="rounded border">
      <div className="border-b bg-slate-50 px-3 py-1.5 text-xs font-medium">
        {title} (eerste 20 regels)
      </div>
      <pre className="max-h-64 overflow-auto p-2 text-[11px] leading-snug">
        {lines.join("\n")}
      </pre>
    </div>
  );
}
