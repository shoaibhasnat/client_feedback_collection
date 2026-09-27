import type { ItemSection, ItemType } from "@/lib/form/types";
import { FIELD_TYPES, QUESTION_TYPES } from "@/lib/form/types";

// Labels and compatibility rules shared by the form builder UI and its server actions.

export const TYPE_LABELS: Record<ItemType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  rating_5: "Rating 1–5",
  rating_10: "Rating 1–10",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  yes_no: "Yes / No",
  text: "Text",
  email: "Email",
  phone: "Phone",
  url: "Link (URL)",
  image: "Image upload",
  dropdown: "Dropdown",
};

export function typesFor(section: ItemSection): ItemType[] {
  return section === "question" ? QUESTION_TYPES : FIELD_TYPES;
}

export const CLIENT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  job_title: "Job title",
  company: "Company",
  website: "Website",
  linkedin_url: "LinkedIn",
  photo_url: "Photo",
  logo_url: "Company logo",
  email: "Email (primary)",
  phone: "Phone",
  whatsapp: "WhatsApp",
  preferred_contact: "Preferred contact method",
  country: "Country",
  city: "City",
  timezone: "Time zone",
};

export const PROJECT_FIELD_LABELS: Record<string, string> = {
  name: "Project name",
  description: "Description",
  service_type: "Service type",
  platform: "Platform",
  start_date: "Start date",
  end_date: "End date",
  outcomes: "Results / outcomes",
};

/** Which item types may write into a given client property when answers are merged. */
export function mappingAllows(field: string, type: ItemType): boolean {
  if (field.startsWith("custom:")) return type !== "image";
  switch (field) {
    case "email":
      return type === "email";
    case "website":
    case "linkedin_url":
      return type === "url";
    case "photo_url":
    case "logo_url":
      return type === "image";
    case "phone":
    case "whatsapp":
      return type === "phone" || type === "text";
    case "preferred_contact":
      return type === "dropdown" || type === "text";
    default:
      return type === "text" || type === "dropdown";
  }
}

export const COPY_FIELDS: { key: string; label: string; long?: boolean; group: string }[] = [
  { group: "Welcome", key: "welcome_title", label: "Welcome title" },
  { group: "Welcome", key: "welcome_text", label: "Welcome text", long: true },
  { group: "Welcome", key: "start_button", label: "Start button" },
  { group: "Steps", key: "rating_title", label: "Rating question" },
  { group: "Steps", key: "video_title", label: "Video step title" },
  { group: "Steps", key: "about_title", label: "About you title" },
  { group: "Steps", key: "contact_title", label: "Contact title" },
  { group: "Steps", key: "next_button", label: "Next button" },
  { group: "Steps", key: "back_button", label: "Back button" },
  { group: "Steps", key: "submit_button", label: "Submit button" },
  { group: "Consent", key: "consent_title", label: "Consent title" },
  { group: "Consent", key: "privacy_note", label: "Privacy note", long: true },
  { group: "Consent", key: "consent_full", label: "“Full” description", long: true },
  { group: "Consent", key: "consent_partial", label: "“Partial” description", long: true },
  { group: "Consent", key: "consent_anonymous", label: "“Anonymous” description", long: true },
  { group: "Consent", key: "consent_private", label: "“Private” description", long: true },
  { group: "Consent", key: "consent_confirm", label: "Confirmation checkbox", long: true },
  { group: "Thank you", key: "thanks_title", label: "Thank-you title" },
  { group: "Thank you", key: "thanks_text", label: "Thank-you text", long: true },
];
