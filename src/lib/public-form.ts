import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TemplateSnapshot } from "@/lib/form/types";
import { FONTS, googleFontsHref, parseTheme } from "@/lib/site/config";

// The public form has no login: the request token is the only key (brief 3.6).
// Every query below is pinned to the single request that token maps to, and its workspace.

export type LoadedRequest = {
  id: string;
  workspace_id: string;
  client_id: string;
  status: string;
  token: string;
  personal_message: string | null;
  template_snapshot: TemplateSnapshot;
  expires_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  revoked_at: string | null;
  workspace: { id: string; name: string; status: string };
};

export type TokenState =
  | { state: "ok"; request: LoadedRequest }
  | { state: "invalid" | "unavailable" | "revoked" | "expired" }
  | { state: "submitted"; request: LoadedRequest };

const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

export async function loadRequestByToken(token: string): Promise<TokenState> {
  if (!TOKEN_RE.test(token)) return { state: "invalid" };
  const admin = createAdminClient();
  const { data } = await admin
    .from("requests")
    .select(
      "id, workspace_id, client_id, status, token, personal_message, template_snapshot, expires_at, sent_at, opened_at, started_at, submitted_at, revoked_at, workspaces(id, name, status)",
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) return { state: "invalid" };

  const workspace = data.workspaces as unknown as LoadedRequest["workspace"];
  const request = { ...data, workspace } as unknown as LoadedRequest;
  if (!workspace || workspace.status === "deleted") return { state: "invalid" };
  if (workspace.status !== "active") return { state: "unavailable" };
  if (request.revoked_at) return { state: "revoked" };
  if (request.submitted_at) return { state: "submitted", request };
  if (request.expires_at && new Date(request.expires_at) < new Date()) return { state: "expired" };
  return { state: "ok", request };
}

export type PublicTheme = {
  primary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  /** Fonts and optional background image from the site theme (brief §6: the form uses the same theme). */
  fontHeading?: string;
  fontBody?: string;
  fontsHref?: string;
  backgroundImage?: string | null;
};

export async function loadFormBranding(workspaceId: string, ownerPhotoPath: string | null) {
  const admin = createAdminClient();
  const { data } = await admin.from("site_settings").select("theme, profile").eq("workspace_id", workspaceId).maybeSingle();
  const site = parseTheme(data?.theme);
  // The form follows the site's mode; "system" uses the light palette (the form must stay readable everywhere).
  const palette = site.mode === "dark" ? site.dark : site.light;
  const heading = FONTS.find((f) => f.name === site.fonts.heading)!;
  const body = FONTS.find((f) => f.name === site.fonts.body)!;
  let backgroundImage: string | null = null;
  const bg = site.form.background_image;
  if (bg && bg.startsWith(`${workspaceId}/`)) {
    const { data: signedBg } = await admin.storage.from("uploads").createSignedUrl(bg, 3600);
    backgroundImage = signedBg?.signedUrl ?? null;
  }
  const theme: PublicTheme = {
    ...palette,
    fontHeading: `'${heading.name}', ${heading.category}`,
    fontBody: `'${body.name}', ${body.category}`,
    fontsHref: googleFontsHref(site),
    backgroundImage,
  };

  // Prefer the owner's current photo; fall back to the one captured in the snapshot.
  const profile = (data?.profile ?? {}) as Record<string, string | null>;
  const photoPath = profile.photo_url ?? ownerPhotoPath;
  let photoUrl: string | null = null;
  if (photoPath && photoPath.startsWith(`${workspaceId}/`)) {
    const { data: signed } = await admin.storage.from("uploads").createSignedUrl(photoPath, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }
  return { theme, ownerPhotoUrl: photoUrl, ownerName: profile.name || null, shareUrl: profile.share_url || null };
}

/**
 * Signed preview URLs for images on this form: ones the client uploaded to this submission,
 * or ones prefilled from their own client record. Nothing outside those two folders is signed.
 */
export async function signFormImages(
  workspaceId: string,
  scope: { submissionId: string | null; clientId: string; snapshotPrefills?: string[] },
  paths: string[],
) {
  const prefixes = [`${workspaceId}/clients/${scope.clientId}/`];
  if (scope.submissionId) prefixes.push(`${workspaceId}/submissions/${scope.submissionId}/`);
  // Exact paths the owner froze into this request's snapshot (e.g. a photo merged from an earlier submission).
  const frozen = new Set((scope.snapshotPrefills ?? []).filter((p) => p.startsWith(`${workspaceId}/`)));
  const valid = [...new Set(paths)].filter((p) => frozen.has(p) || prefixes.some((prefix) => p.startsWith(prefix)));
  if (!valid.length) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage.from("uploads").createSignedUrls(valid, 3600);
  const urls: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  return urls;
}
