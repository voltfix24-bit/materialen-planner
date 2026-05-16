import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";

type Item = { code: string; message: string; count?: number };

const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("nl-NL") : "—";

function StatCard({ label, value, tone = "default" }: { label: string; value: React.ReactNode; tone?: "default" | "red" | "amber" | "green" }) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "green"
          ? "border-emerald-200 bg-emerald-50"
          : "";
  return (
    <Card className={`p-3 ${cls}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

export function CaseControlPanel({ caseId }: { caseId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
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

  if (isLoading || !data)
    return <div className="text-sm text-slate-500">Controle laden…</div>;

  const ready: boolean = !!data.ready;
  const status: string = data.status ?? "unknown";
  const blocking: Item[] = data.blocking_items ?? [];
  const warnings: Item[] = data.warning_items ?? [];
  const s = data.summary ?? {};
  const t = s.timestamps ?? {};

  return (
    <div className="space-y-6">
      <Card
        className={`p-5 ${
          ready
            ? warnings.length > 0
              ? "border-amber-300 bg-amber-50"
              : "border-emerald-300 bg-emerald-50"
            : "border-red-300 bg-red-50"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {ready && warnings.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              ) : ready ? (
                <AlertTriangle className="h-5 w-5 text-amber-700" />
              ) : (
                <XCircle className="h-5 w-5 text-red-700" />
              )}
              <h3 className="text-base font-semibold">
                {!ready
                  ? "Niet gereed voor export"
                  : warnings.length > 0
                    ? "Gereed met waarschuwingen"
                    : "Gereed voor export"}
              </h3>
              <Badge variant="outline" className="ml-2 text-xs">
                {status}
              </Badge>
            </div>

            {blocking.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase text-red-700">
                  Blokkerend ({blocking.length})
                </div>
                <ul className="mt-1 space-y-1">
                  {blocking.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                      <span>
                        <span className="font-mono text-xs text-red-600">[{b.code}]</span>{" "}
                        {b.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase text-amber-700">
                  Waarschuwingen ({warnings.length})
                </div>
                <ul className="mt-1 space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                      <span>
                        <span className="font-mono text-xs text-amber-700">[{w.code}]</span>{" "}
                        {w.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ready && warnings.length === 0 && (
              <p className="mt-2 text-sm text-emerald-800">Alle controles geslaagd.</p>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50"
            disabled={isFetching}
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Vernieuwen
          </button>
        </div>
      </Card>

      <div>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Materiaalstaat
        </h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Regels met hoeveelheid"
            value={`${s.material_lines_with_quantity ?? 0} / ${s.material_total_lines ?? 0}`}
            tone={(s.material_lines_with_quantity ?? 0) > 0 ? "green" : "red"}
          />
          <StatCard
            label="Zonder artikelnummer"
            value={s.missing_article_number ?? 0}
            tone={(s.missing_article_number ?? 0) === 0 ? "green" : "red"}
          />
          <StatCard
            label="Negatieve totalen"
            value={s.negative_total ?? 0}
            tone={(s.negative_total ?? 0) === 0 ? "green" : "red"}
          />
          <StatCard
            label="Formule-placeholders"
            value={s.formula_placeholder ?? 0}
            tone={(s.formula_placeholder ?? 0) === 0 ? "green" : "amber"}
          />
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Aanvulling
        </h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Aanvullingsregels"
            value={s.aanvulling_lines ?? 0}
            tone={(s.aanvulling_lines ?? 0) > 0 ? "green" : "amber"}
          />
          <StatCard
            label="Aanvulling status"
            value={s.aanvulling_stale ? "Verouderd" : (s.aanvulling_lines ?? 0) > 0 ? "Actueel" : "—"}
            tone={s.aanvulling_stale ? "amber" : (s.aanvulling_lines ?? 0) > 0 ? "green" : "default"}
          />
          <StatCard
            label="Exporteerbare regels"
            value={s.exportable_aanvulling_lines ?? 0}
            tone={(s.exportable_aanvulling_lines ?? 0) > 0 ? "green" : "red"}
          />
          <StatCard
            label="Niet/Inactief in Liander"
            value={`${s.unmatched_liander ?? 0} / ${s.inactive_liander ?? 0}`}
            tone={
              (s.unmatched_liander ?? 0) === 0 && (s.inactive_liander ?? 0) === 0
                ? "green"
                : "amber"
            }
          />
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Laatste opbouw: {fmt(t.last_aanvulling_rebuild_at)}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Verkooporder & export
        </h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="SO-instellingen"
            value={
              (s.verkooporder_settings_missing?.length ?? 0) === 0
                ? "Compleet"
                : `Mist: ${(s.verkooporder_settings_missing ?? []).join(", ")}`
            }
            tone={(s.verkooporder_settings_missing?.length ?? 0) === 0 ? "green" : "red"}
          />
          <StatCard
            label="Verkooporderregels"
            value={s.verkooporder_lines ?? 0}
            tone={(s.verkooporder_lines ?? 0) > 0 ? "green" : "default"}
          />
          <StatCard
            label="Verkooporder status"
            value={s.verkooporder_stale ? "Verouderd" : (s.verkooporder_lines ?? 0) > 0 ? "Actueel" : "—"}
            tone={s.verkooporder_stale ? "amber" : (s.verkooporder_lines ?? 0) > 0 ? "green" : "default"}
          />
          <StatCard
            label="Laatste export"
            value={fmt(t.last_exported_at)}
            tone={t.export_stale ? "amber" : t.last_exported_at ? "green" : "default"}
          />
        </div>
        {s.last_failed_export && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <strong>Laatste mislukte export:</strong> {fmt(s.last_failed_export.exported_at)} —{" "}
            {s.last_failed_export.error_message}
          </div>
        )}
      </div>
    </div>
  );
}
