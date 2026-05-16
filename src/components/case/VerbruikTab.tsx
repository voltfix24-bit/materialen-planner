import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Info } from "lucide-react";

type Warning = { code: string; label: string; severity: "blocking" | "warning" | "info" };

type VerbruikRow = {
  id: string;
  article_number: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  used_quantity: number | null;
  return_quantity: number | null;
  total_quantity: number | null;
  charge_or_haspel_number: string | null;
  note: string | null;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  sort_order: number | null;
  excel_row_number: number | null;
  template_line_id: string | null;
  source_template_id: string | null;
  formula_status: string | null;
  source_label: string | null;
  liander_status: "active" | "inactive" | "not_found" | "unknown";
  requires_charge_or_haspel: boolean;
  warnings: Warning[];
  has_blocking_warning: boolean;
};

const LIANDER_LABELS: Record<string, string> = {
  active: "Liander actief",
  inactive: "Liander inactief",
  not_found: "Niet in Liander",
  unknown: "Geen artikelnr",
};

const SOURCE_LABELS: Record<string, string> = {
  template: "Template",
  artikelbestand: "Artikelbestand",
  handmatig: "Handmatig",
  auto: "Auto",
  overig: "Overig",
};

function WarningBadges({ warnings }: { warnings: Warning[] }) {
  if (!warnings?.length) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {warnings.map((w) => (
        <Badge
          key={w.code}
          variant={w.severity === "blocking" ? "destructive" : "secondary"}
          className={
            w.severity === "warning"
              ? "bg-amber-100 text-amber-900 hover:bg-amber-100"
              : undefined
          }
        >
          {w.label}
        </Badge>
      ))}
    </div>
  );
}

function LianderBadge({ status }: { status: VerbruikRow["liander_status"] }) {
  const color =
    status === "active"
      ? "bg-emerald-100 text-emerald-900"
      : status === "inactive"
        ? "bg-amber-100 text-amber-900"
        : status === "not_found"
          ? "bg-red-100 text-red-900"
          : "bg-slate-100 text-slate-700";
  return <Badge className={`${color} hover:${color}`}>{LIANDER_LABELS[status]}</Badge>;
}

export function VerbruikTab({ caseId, caseRow }: { caseId: string; caseRow: any }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["verbruik", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_case_verbruik_lines", {
        p_case_id: caseId,
      });
      if (error) throw error;
      return (data ?? []) as VerbruikRow[];
    },
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [warningFilter, setWarningFilter] = useState<string>("all");
  const [lianderFilter, setLianderFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [onlyWithQty, setOnlyWithQty] = useState(false);
  const [onlyFormula, setOnlyFormula] = useState(false);

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.category_id) m.set(r.category_id, r.category_name || r.category_code || "—");
    });
    return Array.from(m.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.article_number ?? ""} ${r.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (category !== "all" && r.category_id !== category) return false;
      if (warningFilter === "any" && r.warnings.length === 0) return false;
      if (warningFilter === "blocking" && !r.has_blocking_warning) return false;
      if (warningFilter !== "all" && warningFilter !== "any" && warningFilter !== "blocking") {
        if (!r.warnings.some((w) => w.code === warningFilter)) return false;
      }
      if (lianderFilter !== "all" && r.liander_status !== lianderFilter) return false;
      if (sourceFilter !== "all" && r.source_label !== sourceFilter) return false;
      if (onlyWithQty && Number(r.total_quantity ?? 0) <= 0) return false;
      if (onlyFormula && r.formula_status !== "stored_not_active") return false;
      return true;
    });
  }, [rows, search, category, warningFilter, lianderFilter, sourceFilter, onlyWithQty, onlyFormula]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      withQty: rows.filter((r) => Number(r.total_quantity ?? 0) > 0).length,
      missingArticle: rows.filter((r) =>
        r.warnings.some((w) => w.code === "missing_article_number"),
      ).length,
      formula: rows.filter((r) => r.formula_status === "stored_not_active").length,
      notInLiander: rows.filter((r) => r.liander_status === "not_found").length,
      withCharge: rows.filter(
        (r) => (r.charge_or_haspel_number ?? "").trim() !== "",
      ).length,
      withWarnings: rows.filter((r) => r.warnings.length > 0).length,
      blocking: rows.filter((r) => r.has_blocking_warning).length,
      negative: rows.filter((r) => r.warnings.some((w) => w.code === "negative_total"))
        .length,
      missingHaspel: rows.filter((r) =>
        r.warnings.some((w) => w.code === "missing_charge_or_haspel"),
      ).length,
    };
  }, [rows]);

  if (isLoading) {
    return (
      <Card className="p-6 text-slate-500">Verbruik laden…</Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-slate-500">
        Geen verbruikregels. Vul aantallen in op de Materiaalstaat.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Samenvatting */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Verbruikregels" value={stats.total} />
          <Stat label="Met totaal > 0" value={stats.withQty} />
          <Stat label="Ontbrekend artikelnr" value={stats.missingArticle} tone={stats.missingArticle ? "red" : undefined} />
          <Stat label="Formule-placeholder" value={stats.formula} tone={stats.formula ? "amber" : undefined} />
          <Stat label="Niet in Liander" value={stats.notInLiander} tone={stats.notInLiander ? "amber" : undefined} />
          <Stat label="Met charge/haspel" value={stats.withCharge} />
          <Stat label="Met waarschuwing" value={stats.withWarnings} tone={stats.withWarnings ? "amber" : undefined} />
        </div>
      </Card>

      {/* Controle vóór export */}
      {(stats.missingArticle > 0 ||
        stats.negative > 0 ||
        stats.formula > 0 ||
        stats.notInLiander > 0 ||
        stats.missingHaspel > 0) && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            Controle vóór export
          </div>
          <ul className="space-y-1 text-sm text-amber-900">
            {stats.missingArticle > 0 && <li>• {stats.missingArticle} regel(s) zonder artikelnummer terwijl er een totaal is.</li>}
            {stats.negative > 0 && <li>• {stats.negative} regel(s) met een negatief totaal.</li>}
            {stats.formula > 0 && <li>• {stats.formula} formule-placeholderregel(s) — niet automatisch berekend.</li>}
            {stats.notInLiander > 0 && <li>• {stats.notInLiander} artikel(en) niet in actieve Liander-lijst.</li>}
            {stats.missingHaspel > 0 && <li>• {stats.missingHaspel} regel(s) waarbij charge/haspel verplicht is maar ontbreekt.</li>}
          </ul>
          <div className="mt-2 flex items-center gap-1 text-xs text-amber-800">
            <Info className="h-3 w-3" /> Dit blok blokkeert export niet, maar de CSV-export voert zijn eigen validaties uit.
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Zoek artikelnr of omschrijving…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Categorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
              {categories.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warningFilter} onValueChange={setWarningFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Waarschuwing" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle regels</SelectItem>
              <SelectItem value="any">Met waarschuwing</SelectItem>
              <SelectItem value="blocking">Blokkerend</SelectItem>
              <SelectItem value="missing_article_number">Ontbrekend artikelnr</SelectItem>
              <SelectItem value="negative_total">Negatief totaal</SelectItem>
              <SelectItem value="formula_not_active">Formule niet actief</SelectItem>
              <SelectItem value="not_in_liander">Niet in Liander</SelectItem>
              <SelectItem value="liander_inactive">Liander inactief</SelectItem>
              <SelectItem value="missing_charge_or_haspel">Charge/haspel ontbreekt</SelectItem>
            </SelectContent>
          </Select>
          <Select value={lianderFilter} onValueChange={setLianderFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Liander-status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Liander-statussen</SelectItem>
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="inactive">Inactief</SelectItem>
              <SelectItem value="not_found">Niet gevonden</SelectItem>
              <SelectItem value="unknown">Onbekend</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Bron" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle bronnen</SelectItem>
              <SelectItem value="template">Template</SelectItem>
              <SelectItem value="artikelbestand">Artikelbestand</SelectItem>
              <SelectItem value="handmatig">Handmatig</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onlyWithQty} onCheckedChange={(v) => setOnlyWithQty(!!v)} />
            Alleen totaal &gt; 0
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onlyFormula} onCheckedChange={(v) => setOnlyFormula(!!v)} />
            Alleen formule-placeholders
          </label>
          <div className="ml-auto text-xs text-slate-500">
            {filtered.length} van {rows.length} regels
          </div>
        </div>
      </Card>

      {/* Tabel */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Excel rij</th>
              <th className="px-3 py-2">Artikelnr</th>
              <th className="px-3 py-2">Omschrijving</th>
              <th className="px-3 py-2 text-right">Aantal</th>
              <th className="px-3 py-2">Eenheid</th>
              <th className="px-3 py-2 text-right">Verbruikt</th>
              <th className="px-3 py-2 text-right">Retour</th>
              <th className="px-3 py-2 text-right">Totaal</th>
              <th className="px-3 py-2">Charge/Haspel</th>
              <th className="px-3 py-2">Categorie</th>
              <th className="px-3 py-2">Bron</th>
              <th className="px-3 py-2">Liander</th>
              <th className="px-3 py-2">Formule</th>
              <th className="px-3 py-2">Case</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Opmerking</th>
              <th className="px-3 py-2">Waarschuwingen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={17} className="px-4 py-10 text-center text-slate-400">
                  Geen regels die aan de filters voldoen.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                className={`border-t ${r.has_blocking_warning ? "bg-red-50" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {r.excel_row_number ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.article_number || "—"}</td>
                <td className="px-3 py-2">{r.description || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.quantity ?? 0)}</td>
                <td className="px-3 py-2 text-slate-500">{r.unit || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.used_quantity ?? 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.return_quantity ?? 0)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {Number(r.total_quantity ?? 0)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.charge_or_haspel_number || "—"}
                </td>
                <td className="px-3 py-2">
                  {r.category_name || r.category_code || "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline">{SOURCE_LABELS[r.source_label ?? "overig"] ?? r.source_label}</Badge>
                </td>
                <td className="px-3 py-2"><LianderBadge status={r.liander_status} /></td>
                <td className="px-3 py-2 text-xs">
                  {r.formula_status === "stored_not_active" ? (
                    <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">placeholder</Badge>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{caseRow?.case_number || "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{caseRow?.project_number || "—"}</td>
                <td className="px-3 py-2 text-slate-500">{r.note || ""}</td>
                <td className="px-3 py-2"><WarningBadges warnings={r.warnings ?? []} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "amber";
}) {
  const color =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-slate-900";
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
