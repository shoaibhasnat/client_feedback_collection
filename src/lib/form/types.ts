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

export const QUESTION_TYPES: ItemType[] = ["short_text", "long_text", "rating_5", "rating_10", "single_choice", "multiple_choice", "yes_no"];
export const FIELD_TYPES: ItemType[] = ["text", "email", "phone", "url", "image", "dropdown"];
export const CHOICE_TYPES: ItemType[] = ["single_choice", "multiple_choice", "dropdown"];

export type ConsentLevel = "full" | "partial" | "anonymous" | "private";

export const CONSENT_LEVELS: ConsentLevel[] = ["full", "partial", "anonymous", "private"];

export type PrefillSource = "none" | "client" | "project" | "custom";

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
  default_prefill: PrefillSource;
  default_prefill_field?: string | null;
  default_prefill_value: string | null;
  default_prefill_locked: boolean;
  sort_order: number;
  archived_at: string | null;
};

/**
 * The four per-item settings from brief §3.7, fully resolved.
 * Items are form_items keys plus the pseudo-items `__rating` and `__consent`.
 */
export type ItemSettings = {
  shown: boolean;
  required: boolean;
  prefill_source: PrefillSource;
  /** Client or project property to read, e.g. "company" or "custom:team_size". */
  prefill_field: string | null;
  /** Used when prefill_source is "custom". */
  prefill_value: string | null;
  prefill_locked: boolean;
};

export type ItemOverride = Partial<ItemSettings>;
export type OverrideMap = Record<string, ItemOverride>;

export const RATING_KEY = "__rating";
export const CONSENT_KEY = "__consent";

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
  rating_required?: boolean;
  video_enabled: boolean;
  video_max_seconds: number;
  consent_options: ConsentLevel[];
  cta: { type: "none" | "share" | "link"; label: string; url: string };
};

export type TemplateCopy = Record<string, string>;

export type TemplateSnapshot = {
  /** 1 = Phase 1 (template defaults only); 2 = per-item overrides resolved. */
  version: 1 | 2;
  template: { id: string; name: string };
  settings: TemplateSettings & {
    /** Set when the owner hid the consent step: the only permitted level (brief §3.7). */
    consent_forced?: "private" | null;
  };
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

export type FormPreset = {
  id: string;
  name: string;
  /** "default" keeps the template/client setting. */
  rating: "shown" | "hidden" | "default";
  /** Show only the first N active questions; null = all. */
  questions_limit: number | null;
  sections_hidden: ("about" | "contact")[];
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
