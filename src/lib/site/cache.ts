import "server-only";
import { revalidateTag } from "next/cache";

// Public pages are cached per workspace and invalidated whenever something that feeds them changes.
export const siteTag = (workspaceId: string) => `public-site:${workspaceId}`;
export const PUBLIC_WORKSPACES_TAG = "public-workspaces";

/** Call after any owner change that can alter the public site (testimonials, tags, collections, appearance, profile). */
export function revalidateSite(workspaceId: string) {
  revalidateTag(siteTag(workspaceId), { expire: 0 });
}

/** Call after a workspace's slug or status changes. */
export function revalidatePublicWorkspaces(workspaceId?: string) {
  revalidateTag(PUBLIC_WORKSPACES_TAG, { expire: 0 });
  if (workspaceId) revalidateSite(workspaceId);
}
