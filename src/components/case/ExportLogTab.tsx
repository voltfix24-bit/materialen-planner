import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ExportLogTab({ caseId }: { caseId: string }) {
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
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">Datum/tijd</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Bestandsnaam</th>
            <th className="px-4 py-2 text-right">Aantal regels</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                Nog geen exports.
              </td>
            </tr>
          )}
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-2">
                {new Date(r.exported_at).toLocaleString("nl-NL")}
              </td>
              <td className="px-4 py-2">{r.export_type}</td>
              <td className="px-4 py-2 font-mono text-xs">{r.file_name}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.row_count}</td>
              <td className="px-4 py-2">
                <Badge
                  variant="secondary"
                  className={
                    r.status === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }
                >
                  {r.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
