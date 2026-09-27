// Tags label testimonials and clients (service, industry, platform, result type). Unique per workspace.

export type TagType = "service" | "industry" | "platform" | "result" | "other";
export type Tag = { id: string; name: string; type: TagType | null; color: string | null };

export const TAG_TYPES: { value: TagType; label: string }[] = [
  { value: "service", label: "Service" },
  { value: "industry", label: "Industry" },
  { value: "platform", label: "Platform" },
  { value: "result", label: "Result type" },
  { value: "other", label: "Other" },
];

export const TAG_COLORS = ["slate", "blue", "green", "amber", "red", "purple", "pink", "teal"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  pink: "bg-pink-50 text-pink-700 ring-pink-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
};

export function tagColorClass(color: string | null | undefined) {
  return TAG_COLOR_CLASSES[(TAG_COLORS as readonly string[]).includes(color ?? "") ? (color as TagColor) : "slate"];
}

/** Tag ids submitted in a form, limited to ids that exist in this workspace. */
export function pickTagIds(formData: FormData, known: { id: string }[]): string[] {
  const allowed = new Set(known.map((t) => t.id));
  return [...new Set(formData.getAll("tags").map(String))].filter((id) => allowed.has(id));
}
