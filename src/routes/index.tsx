import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { STATUS, STATUS_OPTIONS, type CaseStatus } from "@/lib/case-status";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id, case_number, project_number, description, case_date, status, created_at, export_stale, last_exported_at, case_material_lines(count), export_logs(exported_at, status)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (data ?? []).filter((c: any) => {
    const matchesQ =
      !q ||
      [c.case_number, c.project_number, c.description]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q.toLowerCase()));
    const matchesStatus = status === "all" || c.status === status;
    return matchesQ && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="text-sm text-slate-500">
            Overzicht van alle werkvoorbereidings-cases.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/cases/new" })}>
          <Plus className="h-4 w-4" /> Nieuwe case
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek op casenummer, projectnummer of omschrijving"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Casenummer</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Omschrijving</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Regels</th>
              <th className="px-4 py-3">Laatste export</th>
              <th className="px-4 py-3">Export status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Laden…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Geen cases gevonden.
                </td>
              </tr>
            )}
            {filtered.map((c: any) => {
              const s = STATUS[(c.status as CaseStatus) ?? "concept"];
              const lineCount = c.case_material_lines?.[0]?.count ?? 0;
              const sortedLogs = (c.export_logs ?? []).slice().sort(
                (a: any, b: any) => b.exported_at.localeCompare(a.exported_at),
              );
              const lastExportTs = c.last_exported_at ?? sortedLogs[0]?.exported_at ?? null;
              const lastExport = lastExportTs
                ? new Date(lastExportTs).toLocaleString("nl-NL")
                : "—";
              const lastStatus = sortedLogs[0]?.status ?? null;
              return (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
                  onClick={() =>
                    navigate({ to: "/cases/$caseId", params: { caseId: c.id } })
                  }
                >
                  <td className="px-4 py-3 font-medium">{c.case_number || "—"}</td>
                  <td className="px-4 py-3">{c.project_number || "—"}</td>
                  <td className="px-4 py-3">{c.description || "—"}</td>
                  <td className="px-4 py-3">
                    {c.case_date
                      ? new Date(c.case_date).toLocaleDateString("nl-NL")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={s.className} variant="secondary">
                      {s.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{lineCount}</td>
                  <td className="px-4 py-3 text-slate-500">{lastExport}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {!lastExportTs && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                          Nog niet
                        </Badge>
                      )}
                      {lastExportTs && lastStatus === "success" && !c.export_stale && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                          Actueel
                        </Badge>
                      )}
                      {c.export_stale && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                          Stale
                        </Badge>
                      )}
                      {lastStatus === "failed" && (
                        <Badge variant="secondary" className="bg-red-100 text-red-700">
                          Laatste mislukt
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
