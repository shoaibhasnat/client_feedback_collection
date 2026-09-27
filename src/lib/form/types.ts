export type ItemSection = "question" | "about" | "contact";

export type ItemType =
  | "short_text"
  | "long_text"
  | "rating_5"
  | "rating_10"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "text"
  | "email"
  | "phone"
  | "url"
  | "image"
  | "dropdown";

export type ConsentLevel = "full" | "partial" | "anonymous" | "private";

export const CONSENT_LEVELS: ConsentLevel[] = ["full", "partial", "anonymous", "private"];

/** A form_items row as stored in the template. */
export type FormItemRow = {
  id: string;
  section: ItemSection;
  key: string;
  label: string;
  helper_text: string | null;
  placeholder: string | null;
  type: ItemType;
  options: string[];
  required: boolean;
  visibility: "public-eligible" | "private-only";
  maps_to_client_field: string | null;
  default_shown: boolean;
  default_prefill: "none" | "client" | "project" | "custom";
  default_prefill_value: string | null;
  default_prefill_locked: boolean;
  sort_order: number;
  archived_at: string | null;
};

/** An item frozen into a request's template snapshot, with settings already resolved. */
export type SnapshotItem = {
  key: string;
  section: ItemSection;
  label: string;
  helper_text: string | null;
  placeholder: string | null;
  type: ItemType;
  options: string[];
  required: boolean;
  visibility: "public-eligible" | "private-only";
  maps_to_client_field: string | null;
  shown: boolean;
  prefill_value: string | null;
  prefill_locked: boolean;
};

export type TemplateSettings = {
  rating_enabled: boolean;
  video_enabled: boolean;
  video_max_seconds: number;
  consent_options: ConsentLevel[];
  cta: { type: "none" | "share" | "link"; label: string; url: string };
};

export type TemplateCopy = Record<string, string>;

export type TemplateSnapshot = {
  version: 1;
  template: { id: string; name: string };
  settings: TemplateSettings;
  copy: TemplateCopy;
  items: SnapshotItem[];
  context: {
    client_first_name: string;
    client_name: string;
    project_name: string;
    company: string;
  };
  owner: { name: string; photo_url: string | null; tagline: string; share_url: string };
  created_at: string;
};

export type AnswerValue = string | number | string[] | null;

export type FormValues = {
  rating: number | null;
  answers: Record<string, AnswerValue>;
  about: Record<string, AnswerValue>;
  contact: Record<string, AnswerValue>;
  consent_level: ConsentLevel | null;
  consent_confirmed: boolean;
};

export type Step =
  | { kind: "welcome" }
  | { kind: "rating" }
  | { kind: "question"; item: SnapshotItem; index: number; total: number }
  | { kind: "about"; items: SnapshotItem[] }
  | { kind: "contact"; items: SnapshotItem[] }
  | { kind: "consent" };
