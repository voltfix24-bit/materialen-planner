import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AanvullingTab({
  caseId,
  caseRow,
}: {
  caseId: string;
  caseRow: any;
}) {
  const qc = useQueryClient();
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);

  const matchedQuery = useQuery({
    queryKey: ["aanvulling-matched", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_case_aanvulling_lines" as any,
        { p_case_id: caseId },
      );
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const unmatchedQuery = useQuery({
    queryKey: ["aanvulling-unmatched-rpc", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_case_aanvulling_unmatched_lines" as any,
        { p_case_id: caseId },
      );
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const rows = matchedQuery.data ?? [];
  const unmatchedAll = unmatchedQuery.data ?? [];

  const { data: lianderInfo } = useQuery({
    queryKey: ["aanvulling-liander-info"],
    queryFn: async () => {
      const [{ count: activeCount }, { data: lastImport }] = await Promise.all([
        supabase
          .from("liander_assortment_items")
          .select("id", { count: "exact", head: true })
          .eq("active", true),
        supabase
          .from("liander_assortment_imports")
          .select("import_date, file_name, status")
          .eq("status", "completed")
          .order("import_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        active_count: activeCount ?? 0,
        last_import_date: (lastImport as any)?.import_date ?? null,
        last_file: (lastImport as any)?.file_name ?? null,
      };
    },
  });

  const notFound = useMemo(
    () => unmatchedAll.filter((u: any) => u.liander_status === "not_found"),
    [unmatchedAll],
  );
  const inactive = useMemo(
    () => unmatchedAll.filter((u: any) => u.liander_status === "inactive"),
    [unmatchedAll],
  );
  const missingArt = useMemo(
    () =>
      unmatchedAll.filter(
        (u: any) => u.liander_status === "missing_article_number",
      ),
    [unmatchedAll],
  );

  const [lastRebuild, setLastRebuild] = useState<any | null>(null);

  const rebuild = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "rebuild_case_order_lines" as any,
        { p_case_id: caseId },
      );
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result: any) => {
      setLastRebuild(result);
      qc.invalidateQueries({ queryKey: ["aanvulling-matched", caseId] });
      qc.invalidateQueries({ queryKey: ["aanvulling-unmatched-rpc", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      toast.success(
        `Aanvulling opnieuw opgebouwd: ${result?.matched_count ?? 0} gematcht · ${
          result?.unmatched_count ?? 0
        } niet gevonden · ${result?.inactive_count ?? 0} inactief · ${
          result?.missing_article_number_count ?? 0
        } zonder artikelnr`,
      );
    },
    onError: (e: any) => {
      toast.error("Rebuild mislukt: " + (e?.message ?? String(e)));
    },
  });

  const totalQty = useMemo(
    () =>
      rows.reduce(
        (s: number, r: any) => s + (Number(r.customer_quantity) || 0),
        0,
      ),
    [rows],
  );

  const lastRebuildAt = caseRow?.last_aanvulling_rebuild_at as string | null;
  const lastMaterialChange = caseRow?.last_material_change_at as string | null;
  const isStale =
    !!lastRebuildAt &&
    !!lastMaterialChange &&
    new Date(lastMaterialChange) > new Date(lastRebuildAt);
  const neverBuilt = !lastRebuildAt;

  const hasIssues =
    notFound.length > 0 || inactive.length > 0 || missingArt.length > 0;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {lianderInfo && lianderInfo.active_count === 0 && (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>
                Er is nog geen Liander Assortimentslijst geïmporteerd. Importeer
                eerst een actuele lijst voordat je Aanvulling kunt opbouwen.
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <MiniStat
            label="Laatste Liander-import"
            value={
              lianderInfo?.last_import_date
                ? new Date(lianderInfo.last_import_date).toLocaleDateString(
                    "nl-NL",
                  )
                : "—"
            }
            hint={lianderInfo?.last_file ?? undefined}
          />
          <MiniStat
            label="Actieve Liander-artikelen"
            value={lianderInfo?.active_count ?? 0}
          />
          <MiniStat label="Bestelregels" value={rows.length} />
          <MiniStat
            label="Niet gevonden"
            value={notFound.length}
            tone={notFound.length > 0 ? "amber" : undefined}
          />
          <MiniStat
            label="Inactief in Liander"
            value={inactive.length}
            tone={inactive.length > 0 ? "amber" : undefined}
          />
          <MiniStat
            label="Zonder artikelnr"
            value={missingArt.length}
            tone={missingArt.length > 0 ? "red" : undefined}
          />
          <MiniStat
            label="Laatste rebuild"
            value={
              lastRebuildAt
                ? new Date(lastRebuildAt).toLocaleString("nl-NL")
                : "—"
            }
          />
        </div>

        {(isStale || neverBuilt) && (
          <Card
            className={`p-3 text-sm ${
              isStale
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-sky-200 bg-sky-50 text-sky-900"
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>
                {isStale
                  ? "Aanvulling mogelijk verouderd — Materiaalstaat is gewijzigd na de laatste rebuild. Bouw opnieuw op."
                  : "Aanvulling is nog niet opgebouwd voor deze case. Klik op 'Aanvulling opnieuw opbouwen'."}
              </div>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Bestelvoorbereiding richting Liander. Alleen artikelen uit de actieve
            Liander Assortimentslijst worden als bestelregel opgeslagen.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOnlyIssues((v) => !v)}
            >
              {showOnlyIssues ? "Toon alles" : "Toon alleen problemen"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                matchedQuery.refetch();
                unmatchedQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              onClick={() => rebuild.mutate()}
              disabled={rebuild.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 ${rebuild.isPending ? "animate-spin" : ""}`}
              />{" "}
              Aanvulling opnieuw opbouwen
            </Button>
          </div>
        </div>

        {lastRebuild && (
          <Card className="border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            Laatste rebuild: {lastRebuild.matched_count} gematcht ·{" "}
            {lastRebuild.unmatched_count} niet gevonden ·{" "}
            {lastRebuild.inactive_count} inactief ·{" "}
            {lastRebuild.missing_article_number_count} zonder artikelnr · uit{" "}
            {lastRebuild.total_source_lines} bronregel(s) /{" "}
            {lastRebuild.total_source_articles} uniek artikel(en)
          </Card>
        )}

        {hasIssues && (
          <Card className="border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-medium">Controle vóór bestellen</div>
            <ul className="mt-1 list-inside list-disc">
              {missingArt.length > 0 && (
                <li>{missingArt.length} regel(s) zonder artikelnummer</li>
              )}
              {notFound.length > 0 && (
                <li>
                  {notFound.length} artikel(en) niet gevonden in actieve
                  Liander-lijst
                </li>
              )}
              {inactive.length > 0 && (
                <li>
                  {inactive.length} artikel(en) inactief in huidige Liander-lijst
                </li>
              )}
            </ul>
          </Card>
        )}

        {!showOnlyIssues && (
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2 text-xs text-slate-500">
              <span>
                {rows.length} bestelregels · Totaal Klant Hoeveelheid:{" "}
                <span className="font-medium tabular-nums">{totalQty}</span>
              </span>
              <span className="text-slate-400">
                Case {caseRow?.case_number ?? "—"} · Project{" "}
                {caseRow?.project_number ?? "—"}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Artikelnr</th>
                  <th className="px-4 py-2">Omschrijving (Liander)</th>
                  <th className="px-4 py-2">Eenheid</th>
                  <th className="px-4 py-2 w-36 text-right">
                    <span className="inline-flex items-center gap-1">
                      Klant Hoeveelheid
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-slate-400" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Klant Hoeveelheid wordt berekend uit de Materiaalstaat
                          (som van totalen per artikelnummer), niet uit de
                          Liander-masterlijst.
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </th>
                  <th className="px-4 py-2 text-right">Bron (Materiaalstaat)</th>
                  <th className="px-4 py-2 text-right">Bronregels</th>
                  <th className="px-4 py-2">Match</th>
                  <th className="px-4 py-2">Laatste Liander-import</th>
                  <th className="px-4 py-2">Opmerking</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      Geen bestelregels — klik op "Aanvulling opnieuw opbouwen".
                    </td>
                  </tr>
                )}
                {rows.map((r: any) => (
                  <tr key={r.case_order_line_id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">
                      {r.article_number}
                    </td>
                    <td className="px-4 py-2">
                      {r.liander_description ?? r.description}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.liander_unit ?? r.unit}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {Number(r.customer_quantity)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {Number(r.source_total_quantity)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {r.source_material_line_count}
                    </td>
                    <td className="px-4 py-2">
                      {r.liander_active === false ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800"
                        >
                          Inactief
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-700"
                        >
                          Actief
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {r.last_liander_import_date
                        ? new Date(
                            r.last_liander_import_date,
                          ).toLocaleDateString("nl-NL")
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {r.note ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <UnmatchedBlock
          title="Niet gevonden in actieve Liander Assortimentslijst"
          tone="amber"
          rows={notFound}
          showArticle
        />
        <UnmatchedBlock
          title="Liander-artikel inactief"
          tone="amber"
          rows={inactive}
          showArticle
        />
        <UnmatchedBlock
          title="Ontbrekend artikelnummer"
          tone="red"
          rows={missingArt}
          showArticle={false}
        />
      </div>
    </TooltipProvider>
  );
}

function UnmatchedBlock({
  title,
  tone,
  rows,
  showArticle,
}: {
  title: string;
  tone: "amber" | "red";
  rows: any[];
  showArticle: boolean;
}) {
  if (rows.length === 0) return null;
  const headClass =
    tone === "red"
      ? "bg-red-50 text-red-800"
      : "bg-amber-50 text-amber-800";
  return (
    <Card className="overflow-hidden p-0">
      <div
        className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${headClass}`}
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="font-medium">{title}</span>
        <span className="text-xs opacity-80">({rows.length})</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            {showArticle && <th className="px-4 py-2">Artikelnr</th>}
            <th className="px-4 py-2">Omschrijving</th>
            <th className="px-4 py-2 text-right">Hoeveelheid</th>
            <th className="px-4 py-2">Eenheid</th>
            <th className="px-4 py-2">Categorie</th>
            <th className="px-4 py-2 text-right">Bronregels</th>
            <th className="px-4 py-2">Reden</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m: any, i: number) => (
            <tr key={`${m.article_number ?? "noart"}-${i}`} className="border-t">
              {showArticle && (
                <td className="px-4 py-2 font-mono text-xs">
                  {m.article_number ?? "—"}
                </td>
              )}
              <td className="px-4 py-2">{m.description ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {Number(m.source_total_quantity)}
              </td>
              <td className="px-4 py-2 text-slate-500">{m.unit ?? ""}</td>
              <td className="px-4 py-2 text-slate-500">
                {m.category_name ?? "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                {m.source_material_line_count}
              </td>
              <td
                className={`px-4 py-2 ${
                  tone === "red" ? "text-red-700" : "text-amber-700"
                }`}
              >
                {m.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: any;
  hint?: string;
  tone?: "amber" | "red";
}) {
  const valueClass =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : "";
  return (
    <Card className="p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-1 text-base font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 truncate text-[10px] text-slate-400" title={hint}>
          {hint}
        </div>
      )}
    </Card>
  );
}
