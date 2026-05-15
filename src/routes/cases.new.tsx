import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/cases/new")({ component: NewCase });

function NewCase() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_number: "",
    case_number: "",
    description: "",
    case_date: new Date().toISOString().slice(0, 10),
    template_version: "",
    asp_sap_code: "",
    delivery_address: "",
    contact_person: "",
    internal_note: "",
    so_number: "",
    so_customernumber: "",
    so_project: "",
  });

  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: any = { ...form, status: "concept" };
    // Defaults: so_number = casenummer, so_project = projectnummer (bewerkbaar later)
    if (!payload.so_number) payload.so_number = payload.case_number || null;
    if (!payload.so_project) payload.so_project = payload.project_number || null;
    if (!payload.case_date) payload.case_date = null;
    Object.keys(payload).forEach((k) => payload[k] === "" && (payload[k] = null));
    const { data, error } = await supabase
      .from("cases")
      .insert(payload)
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error("Opslaan mislukt: " + error.message);
      return;
    }
    toast.success("Case aangemaakt");
    navigate({ to: "/cases/$caseId", params: { caseId: data.id } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nieuwe case</h1>
        <p className="text-sm text-slate-500">
          Vul de basisgegevens in. Materiaalstaat bouw je daarna op.
        </p>
      </div>
      <form onSubmit={submit}>
        <Card className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Projectnummer">
              <Input value={form.project_number} onChange={(e) => set("project_number", e.target.value)} />
            </Field>
            <Field label="Casenummer">
              <Input value={form.case_number} onChange={(e) => set("case_number", e.target.value)} />
            </Field>
          </div>
          <Field label="Omschrijving / projectnaam">
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Datum">
              <Input type="date" value={form.case_date} onChange={(e) => set("case_date", e.target.value)} />
            </Field>
            <Field label="Versie / template">
              <Input value={form.template_version} onChange={(e) => set("template_version", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ASP / SAP-code">
              <Input value={form.asp_sap_code} onChange={(e) => set("asp_sap_code", e.target.value)} />
            </Field>
            <Field label="Contactpersoon">
              <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
            </Field>
          </div>
          <Field label="Afleveradres">
            <Input value={form.delivery_address} onChange={(e) => set("delivery_address", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SO-klantnummer (so_customernumber)">
              <Input value={form.so_customernumber} onChange={(e) => set("so_customernumber", e.target.value)} />
            </Field>
            <Field label="SO-project (so_project)">
              <Input value={form.so_project} onChange={(e) => set("so_project", e.target.value)} />
            </Field>
          </div>
          <Field label="Opmerking intern">
            <Textarea
              value={form.internal_note}
              onChange={(e) => set("internal_note", e.target.value)}
              rows={3}
            />
          </Field>
        </Card>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/" })}>
            Annuleren
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Opslaan…" : "Case aanmaken"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
