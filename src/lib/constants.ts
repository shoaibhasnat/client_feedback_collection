export const CLIENT_SOURCES = [
  { value: "upwork", label: "Upwork" },
  { value: "referral", label: "Referral" },
  { value: "direct", label: "Direct" },
  { value: "other", label: "Other" },
] as const;

export const CLIENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
  { value: "prospect", label: "Prospect" },
  { value: "do_not_contact", label: "Do not contact" },
] as const;

export const PROJECT_PLATFORMS = [
  { value: "upwork", label: "Upwork" },
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
] as const;

export const PROJECT_STATUSES = [
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const CONTACT_METHODS = ["Email", "WhatsApp", "Phone", "Upwork", "LinkedIn"] as const;

export const REQUEST_STATUS_TONE = {
  draft: "slate",
  sent: "blue",
  opened: "blue",
  in_progress: "amber",
  submitted: "purple",
  reviewed: "green",
  published: "green",
  private: "slate",
} as const;

export const CONSENT_LABELS = {
  full: "Full",
  partial: "Partial",
  anonymous: "Anonymous",
  private: "Private",
} as const;

export function labelOf<T extends { value: string; label: string }>(list: readonly T[], value: string | null | undefined) {
  return list.find((i) => i.value === value)?.label ?? "—";
}
