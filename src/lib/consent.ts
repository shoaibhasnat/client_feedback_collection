import type { ConsentLevel } from "@/lib/form/types";

export type DisplayFields = {
  display_name: string | null;
  display_role: string | null;
  display_company: string | null;
  photo_url: string | null;
  logo_url: string | null;
  visibility: "published" | "hidden" | "private";
};

/**
 * Block publishing anything beyond what the client consented to (brief 3.5).
 * Manual testimonials (no consent recorded) are the owner's responsibility and pass.
 */
export function consentViolations(level: ConsentLevel | null, f: DisplayFields): Record<string, string> {
  if (!level || f.visibility !== "published") return {};
  const errors: Record<string, string> = {};
  switch (level) {
    case "private":
      errors.visibility = "The client chose Private: this testimonial can't be published.";
      break;
    case "anonymous":
      if (f.display_name) errors.display_name = "Anonymous: remove the name.";
      if (f.display_company) errors.display_company = "Anonymous: remove the company name. Describe it in the role instead, e.g. “Founder, e-commerce brand”.";
      if (f.photo_url) errors.photo_url = "Anonymous: no photo.";
      if (f.logo_url) errors.logo_url = "Anonymous: no logo.";
      break;
    case "partial":
      if (f.display_name && f.display_name.trim().includes(" ")) errors.display_name = "Partial: first name only.";
      if (f.display_role && f.display_company) errors.display_company = "Partial: show the company or the job title, not both.";
      if (f.photo_url) errors.photo_url = "Partial: no photo.";
      break;
  }
  return errors;
}

export const CONSENT_HELP: Record<ConsentLevel, string> = {
  full: "Name, photo, job title, company and quote can be shown.",
  partial: "First name plus company or job title only. No photo.",
  anonymous: "Quote only, with a generic description like “Founder, e-commerce brand”.",
  private: "For you only. Never published.",
};
