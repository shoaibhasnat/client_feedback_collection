import type { LayoutConfig, SeoConfig, ThemeConfig } from "@/lib/site/config";

// Shapes rendered by the public site. They contain public fields only — nothing here may hold
// contact details, notes, budgets, raw answers or storage paths.

export type PublicTestimonial = {
  id: string;
  quote: string;
  headline: string | null;
  name: string | null;
  role: string | null;
  company: string | null;
  rating: number | null;
  date: string | null;
  platform: string | null;
  photo: string | null; // media route URL
  logo: string | null; // media route URL
  featured: boolean;
  tagIds: string[];
};

export type PublicTag = { id: string; name: string; type: string | null; color: string | null };

export type PublicSite = {
  workspace: { id: string; name: string; slug: string };
  profile: { name: string; tagline: string; bio: string; services: string[]; contactLinks: string[]; photo: string | null };
  theme: ThemeConfig;
  layout: LayoutConfig;
  seo: SeoConfig;
  brand: { logoLight: string | null; logoDark: string | null; favicon: string | null; ogImage: string | null; siteName: string };
  testimonials: PublicTestimonial[];
  tags: PublicTag[];
  stats: { count: number; average: number | null };
};
