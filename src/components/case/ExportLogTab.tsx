import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

function statusBadge(status: string) {
  if (status === "success")
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">success</Badge>;
  if (status === "failed")
    return <Badge variant="secondary" className="bg-red-100 text-red-700">failed</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export function ExportLogTab({ caseId }: { caseId: string }) {
  const [selected, setSelected] = useState<any | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ["export-logs", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("export_logs")
        .select("*")
        .eq("case_id", caseId)
        .order("exported_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Datum/tijd</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Bestandsnaam</th>
              <th className="px-4 py-2 text-right">Regels</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Gebruiker</th>
              <th className="px-4 py-2">CSV versie</th>
              <th className="px-4 py-2">Sep.</th>
              <th className="px-4 py-2">Header</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  Nog geen exports.
                </td>
              </tr>
            )}
            {rows.map((r: any) => {
              const cfg = r.csv_config ?? null;
              return (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">
                    {new Date(r.exported_at).toLocaleString("nl-NL")}
                  </td>
                  <td className="px-4 py-2">{r.export_type}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {r.file_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.row_count}
                  </td>
                  <td className="px-4 py-2">{statusBadge(r.status)}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.exported_by ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {cfg?.version ?? (
                      <span className="text-slate-400">Niet opgeslagen</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {cfg ? (
                      <code className="rounded bg-slate-100 px-1">
                        {cfg.separator}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {cfg ? (cfg.include_header ? "Ja" : "Nee") : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelected(r);
                        setRawOpen(false);
                      }}
                    >
                      Details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Exportdetails</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Meta label="Datum/tijd" value={new Date(selected.exported_at).toLocaleString("nl-NL")} />
                <Meta label="Status" value={selected.status} />
                <Meta label="Type" value={selected.export_type} />
                <Meta label="Bestandsnaam" value={selected.file_name ?? "—"} mono />
                <Meta label="Aantal regels" value={String(selected.row_count)} />
                <Meta label="Gebruiker" value={selected.exported_by ?? "—"} />
              </div>

              {selected.error_message && (
                <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                  <div className="text-xs font-semibold uppercase">Foutmelding</div>
                  <div className="mt-1 whitespace-pre-wrap">
                    {selected.error_message}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  CSV-config
                </div>
                {selected.csv_config ? (
                  <div className="rounded border bg-slate-50 p-3">
                    <table className="w-full text-xs">
                      <tbody>
                        {Object.entries(selected.csv_config).map(([k, v]) => (
                          <tr key={k} className="border-b last:border-b-0">
                            <td className="py-1 pr-3 font-medium text-slate-600">
                              {k}
                            </td>
                            <td className="py-1 font-mono">
                              {typeof v === "object"
                                ? JSON.stringify(v)
                                : JSON.stringify(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">
                    Niet opgeslagen (oudere export)
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  CSV-header
                </div>
                {selected.csv_header ? (
                  <pre className="overflow-x-auto rounded border bg-slate-50 p-2 text-xs">
                    {selected.csv_header}
                  </pre>
                ) : (
                  <div className="text-xs text-slate-400">Niet opgeslagen</div>
                )}
              </div>

              <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1">
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${rawOpen ? "rotate-180" : ""}`}
                    />
                    Raw JSON
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 max-h-72 overflow-auto rounded border bg-slate-50 p-2 text-xs">
                    {JSON.stringify(selected, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={mono ? "font-mono text-xs" : "text-sm"}>{value}</div>
    </div>
  );
}
