import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleDashed,
  RefreshCw,
} from "lucide-react";

type Tone = "green" | "amber" | "red" | "gray";

function ToneBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : tone === "red"
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-600";
  const Icon =
    tone === "green"
      ? CheckCircle2
      : tone === "amber"
        ? AlertTriangle
        : tone === "red"
          ? XCircle
          : CircleDashed;
  return (
    <Badge variant="secondary" className={`gap-1 ${cls}`}>
      <Icon className="h-3 w-3" />
      {children}
    </Badge>
  );
}

function Row({
  label,
  tone,
  value,
}: {
  label: string;
  tone: Tone;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-sm text-slate-700">{label}</span>
      <ToneBadge tone={tone}>{value}</ToneBadge>
    </div>
  );
}

const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("nl-NL") : "—";

export function CaseControlPanel({ caseId }: { caseId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["case-readiness", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_case_readiness", {
        p_case_id: caseId,
      });
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading || !data)
    return <div className="text-sm text-slate-500">Controle laden…</div>;

  const c = data.checks ?? {};
  const t = data.timestamps ?? {};
  const blocking: string[] = data.blocking ?? [];
  const warnings: string[] = data.warnings ?? [];
  const ready: boolean = !!data.ready_for_export;

  const settingsMissing: string[] = c.verkooporder_settings_missing ?? [];

  return (
    <div className="space-y-6">
      <Card
        className={`p-5 ${ready ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {ready ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-700" />
              )}
              <h3 className="text-base font-semibold">
                {ready ? "Gereed voor export" : "Nog niet gereed voor export"}
              </h3>
            </div>
            {!ready && blocking.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                {blocking.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            {ready && warnings.length === 0 && (
              <p className="mt-1 text-sm text-emerald-800">
                Alle controles geslaagd.
              </p>
            )}
            {warnings.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  Waarschuwingen
                </div>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50"
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
            />
            Vernieuwen
          </button>
        </div>
      </Card>

      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Materiaalstaat
        </h4>
        <Row
          label="Regels met hoeveelheid > 0"
          tone={c.material_lines_with_quantity > 0 ? "green" : "red"}
          value={`${c.material_lines_with_quantity} / ${c.material_total_lines}`}
        />
        <Row
          label="Regels zonder artikelnummer"
          tone={c.missing_article_number === 0 ? "green" : "red"}
          value={c.missing_article_number}
        />
        <Row
          label="Negatieve totalen"
          tone={c.negative_total === 0 ? "green" : "red"}
          value={c.negative_total}
        />
        <Row
          label="Formule-placeholders (niet automatisch berekend)"
          tone={c.formula_placeholder === 0 ? "green" : "amber"}
          value={c.formula_placeholder}
        />
      </Card>

      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Aanvulling
        </h4>
        <Row
          label="Aanvulling opgebouwd"
          tone={c.aanvulling_lines > 0 ? "green" : "gray"}
          value={
            c.aanvulling_lines > 0
              ? `${c.aanvulling_lines} regels`
              : "Niet opgebouwd"
          }
        />
        <Row
          label="Aanvulling actueel"
          tone={
            c.aanvulling_lines === 0
              ? "gray"
              : c.aanvulling_stale
                ? "amber"
                : "green"
          }
          value={
            c.aanvulling_lines === 0
              ? "—"
              : c.aanvulling_stale
                ? "Verouderd"
                : "Actueel"
          }
        />
        <Row
          label="Niet gevonden in actieve Liander"
          tone={c.unmatched_liander === 0 ? "green" : "amber"}
          value={c.unmatched_liander}
        />
        <Row
          label="Inactief in Liander"
          tone={c.inactive_liander === 0 ? "green" : "amber"}
          value={c.inactive_liander}
        />
        <Row
          label="Exporteerbare Aanvulling-regels"
          tone={c.exportable_aanvulling_lines > 0 ? "green" : "red"}
          value={c.exportable_aanvulling_lines}
        />
        <div className="mt-2 text-xs text-slate-400">
          Laatste opbouw: {fmt(t.last_aanvulling_rebuild_at)}
        </div>
      </Card>

      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Verkooporder
        </h4>
        <Row
          label="Verkooporder-instellingen compleet"
          tone={settingsMissing.length === 0 ? "green" : "red"}
          value={
            settingsMissing.length === 0
              ? "OK"
              : `Mist: ${settingsMissing.join(", ")}`
          }
        />
        <Row
          label="Verkooporder opgebouwd"
          tone={c.verkooporder_lines > 0 ? "green" : "gray"}
          value={
            c.verkooporder_lines > 0
              ? `${c.verkooporder_lines} regels`
              : "Niet opgebouwd"
          }
        />
        <Row
          label="Verkooporder actueel"
          tone={
            c.verkooporder_lines === 0
              ? "gray"
              : c.verkooporder_stale
                ? "amber"
                : "green"
          }
          value={
            c.verkooporder_lines === 0
              ? "—"
              : c.verkooporder_stale
                ? "Verouderd"
                : "Actueel"
          }
        />
        <div className="mt-2 text-xs text-slate-400">
          Laatste opbouw: {fmt(t.last_verkooporder_rebuild_at)}
        </div>
      </Card>

      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Export
        </h4>
        <Row
          label="Export niet verouderd"
          tone={
            !t.last_exported_at
              ? "gray"
              : t.export_stale
                ? "amber"
                : "green"
          }
          value={
            !t.last_exported_at
              ? "Nog niet geëxporteerd"
              : t.export_stale
                ? "Gewijzigd na export"
                : "Actueel"
          }
        />
        <Row
          label="Laatste succesvolle export"
          tone={data.last_export ? "green" : "gray"}
          value={
            data.last_export
              ? `${fmt(data.last_export.exported_at)} · ${data.last_export.row_count} regels`
              : "—"
          }
        />
        <Row
          label="Laatste mislukte export"
          tone={data.last_failed_export ? "red" : "green"}
          value={
            data.last_failed_export
              ? fmt(data.last_failed_export.exported_at)
              : "Geen"
          }
        />
        {data.last_failed_export?.error_message && (
          <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
            {data.last_failed_export.error_message}
          </div>
        )}
      </Card>
    </div>
  );
}
