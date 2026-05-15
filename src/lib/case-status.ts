export const STATUS = {
  concept: { label: "Concept", className: "bg-slate-200 text-slate-700" },
  in_bewerking: { label: "In bewerking", className: "bg-blue-100 text-blue-700" },
  gereed_voor_export: {
    label: "Gereed voor export",
    className: "bg-amber-100 text-amber-800",
  },
  geexporteerd: { label: "Geëxporteerd", className: "bg-emerald-100 text-emerald-700" },
} as const;

export type CaseStatus = keyof typeof STATUS;

export const STATUS_OPTIONS = Object.entries(STATUS).map(([value, v]) => ({
  value: value as CaseStatus,
  label: v.label,
}));
