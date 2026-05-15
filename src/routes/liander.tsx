import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Search, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/liander")({ component: LianderPage });

function LianderPage() {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["liander-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liander_assortment_items")
        .select("*")
        .order("article_number")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: imports = [] } = useQuery({
    queryKey: ["liander-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liander_assortment_imports")
        .select("*")
        .order("import_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = items.filter((it: any) => {
    if (activeFilter === "active" && !it.active) return false;
    if (activeFilter === "inactive" && it.active) return false;
    if (
      q &&
      !`${it.article_number} ${it.description ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Liander Assortimentslijst</h1>
          <p className="text-sm text-slate-500">
            Maandelijks door Liander aangeleverde lijst — basis voor het
            aanvullings-/besteltabblad in cases.
          </p>
        </div>
        <Button
          onClick={() => toast.info("Importer komt in volgende versie.")}
        >
          <Upload className="h-4 w-4" /> Nieuwe Liander-lijst importeren
        </Button>
      </div>

      <Card className="flex items-start gap-3 border-blue-200 bg-blue-50/40 p-4 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4" />
        <div>
          De importfunctionaliteit is nog placeholder. De database en pagina
          zijn klaar om maandelijks nieuwe lijsten te ontvangen, met
          toevoegen/bijwerken op artikelnummer en automatisch op inactief
          zetten van weggevallen artikelen.
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Importgeschiedenis
        </h2>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Bestand</th>
                <th className="px-4 py-2 text-right">Totaal</th>
                <th className="px-4 py-2 text-right">Nieuw</th>
                <th className="px-4 py-2 text-right">Gewijzigd</th>
                <th className="px-4 py-2 text-right">Inactief</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {imports.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Nog geen imports.
                  </td>
                </tr>
              )}
              {imports.map((i: any) => (
                <tr key={i.id} className="border-t">
                  <td className="px-4 py-2">
                    {new Date(i.import_date).toLocaleString("nl-NL")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{i.file_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.total_rows}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.new_items_count}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.updated_items_count}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.inactive_items_count}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline">{i.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek artikelnummer of omschrijving"
              className="pl-9"
            />
          </div>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="inactive">Inactief</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Artikelnr</th>
              <th className="px-4 py-2">Omschrijving</th>
              <th className="px-4 py-2">Eenheid</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-slate-400">
                  Laden…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-slate-400">
                  Geen artikelen — importeer eerst een Liander-lijst.
                </td>
              </tr>
            )}
            {filtered.map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{it.article_number}</td>
                <td className="px-4 py-2">{it.description}</td>
                <td className="px-4 py-2 text-slate-500">{it.unit}</td>
                <td className="px-4 py-2">
                  {it.active ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      Actief
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-slate-200">
                      Inactief
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
